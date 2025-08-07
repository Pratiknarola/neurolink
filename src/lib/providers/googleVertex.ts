import {
  createVertex,
  type GoogleVertexProviderSettings,
} from "@ai-sdk/google-vertex";
import type { ZodType, ZodTypeDef } from "zod";
import {
  streamText,
  Output,
  type Schema,
  type LanguageModelV1,
  type LanguageModel,
} from "ai";
import type { AIProviderName } from "../core/types.js";
import type { StreamOptions, StreamResult } from "../types/streamTypes.js";
import type { UnknownRecord } from "../types/common.js";
import { BaseProvider, type NeuroLinkSDK } from "../core/baseProvider.js";
import { logger } from "../utils/logger.js";
import { TimeoutError } from "../utils/timeout.js";
import { DEFAULT_MAX_TOKENS } from "../core/constants.js";
import {
  validateApiKey,
  createVertexProjectConfig,
  createGoogleAuthConfig,
} from "../utils/providerConfig.js";

// Cache for anthropic module to avoid repeated imports
let _createVertexAnthropic: unknown = null;
let _anthropicImportAttempted = false;

// Function to dynamically import anthropic support
async function getCreateVertexAnthropic() {
  if (_anthropicImportAttempted) {
    return _createVertexAnthropic;
  }

  _anthropicImportAttempted = true;

  try {
    // Try to import the anthropic module - available in @ai-sdk/google-vertex ^2.2.0+
    // Use proper dynamic import without eval() for security
    const anthropicModule = (await import(
      "@ai-sdk/google-vertex/anthropic"
    )) as UnknownRecord;
    _createVertexAnthropic = anthropicModule.createVertexAnthropic;
    logger.debug("[GoogleVertexAI] Anthropic module successfully loaded");
    return _createVertexAnthropic;
  } catch (error) {
    // Anthropic module not available
    logger.warn(
      "[GoogleVertexAI] Anthropic module not available. Install @ai-sdk/google-vertex ^2.2.0 for Anthropic model support.",
    );
    return null;
  }
}

// Configuration helpers - now using consolidated utility
const getVertexProjectId = (): string => {
  return validateApiKey(createVertexProjectConfig());
};

const getVertexLocation = (): string => {
  return (
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.VERTEX_LOCATION ||
    process.env.GOOGLE_VERTEX_LOCATION ||
    "us-central1"
  );
};

const getDefaultVertexModel = (): string => {
  // Use gemini-2.5-flash as default - latest model with optimized streaming
  return process.env.VERTEX_MODEL || "gemini-2.5-flash";
};

const hasGoogleCredentials = (): boolean => {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    (process.env.GOOGLE_AUTH_CLIENT_EMAIL &&
      process.env.GOOGLE_AUTH_PRIVATE_KEY)
  );
};

// Enhanced Vertex settings creation with authentication fallback
const createVertexSettings = (): GoogleVertexProviderSettings => {
  const baseSettings: GoogleVertexProviderSettings = {
    project: getVertexProjectId(),
    location: getVertexLocation(),
  };

  // Check for principal account authentication first (recommended for production)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    logger.debug("Using principal account authentication (recommended)", {
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? "[PROVIDED]"
        : "[NOT_PROVIDED]",
      authMethod: "principal_account",
    });
    // For principal account auth, we don't need to provide explicit credentials
    // The google-auth-library will use GOOGLE_APPLICATION_CREDENTIALS automatically
    return baseSettings;
  }

  // Fallback to explicit credentials for development
  if (
    process.env.GOOGLE_AUTH_CLIENT_EMAIL &&
    process.env.GOOGLE_AUTH_PRIVATE_KEY
  ) {
    logger.debug("Using explicit credentials authentication", {
      authMethod: "explicit_credentials",
      hasClientEmail: !!process.env.GOOGLE_AUTH_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.GOOGLE_AUTH_PRIVATE_KEY,
    });
    return {
      ...baseSettings,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.GOOGLE_AUTH_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_AUTH_PRIVATE_KEY.replace(
            /\\n/g,
            "\n",
          ),
        },
      },
    };
  }

  // Log warning if no valid authentication is available
  logger.warn("No valid authentication found for Google Vertex AI", {
    authMethod: "none",
    hasPrincipalAccount: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    hasExplicitCredentials: !!(
      process.env.GOOGLE_AUTH_CLIENT_EMAIL &&
      process.env.GOOGLE_AUTH_PRIVATE_KEY
    ),
  });
  return baseSettings;
};

// Helper function to determine if a model is an Anthropic model
const isAnthropicModel = (modelName: string): boolean => {
  return modelName.toLowerCase().includes("claude");
};

/**
 * Google Vertex AI Provider v2 - BaseProvider Implementation
 *
 * Features:
 * - Extends BaseProvider for shared functionality
 * - Preserves existing Google Cloud authentication
 * - Maintains Anthropic model support via dynamic imports
 * - Fresh model creation for each request
 * - Enhanced error handling with setup guidance
 * - Tool registration and context management
 */
export class GoogleVertexProvider extends BaseProvider {
  private projectId: string;
  private location: string;
  private registeredTools: Map<
    string,
    {
      description: string;
      parameters: ZodType<unknown>;
      execute: (params: Record<string, unknown>) => Promise<unknown>;
    }
  > = new Map();
  private toolContext: Record<string, unknown> = {};

  constructor(modelName?: string, sdk?: unknown) {
    super(
      modelName,
      "vertex" as AIProviderName,
      sdk as NeuroLinkSDK | undefined,
    );

    // Validate Google Cloud credentials - now using consolidated utility
    if (!hasGoogleCredentials()) {
      validateApiKey(createGoogleAuthConfig());
    }

    // Initialize Google Cloud configuration
    this.projectId = getVertexProjectId();
    this.location = getVertexLocation();

    logger.debug("Google Vertex AI BaseProvider v2 initialized", {
      modelName: this.modelName,
      projectId: this.projectId,
      location: this.location,
      provider: this.providerName,
    });
  }

  protected getProviderName(): AIProviderName {
    return "vertex" as AIProviderName;
  }

  protected getDefaultModel(): string {
    return getDefaultVertexModel();
  }

  /**
   * Returns the Vercel AI SDK model instance for Google Vertex
   * Creates fresh model instances for each request
   */
  protected async getAISDKModel(): Promise<LanguageModel> {
    return this.getModel() as unknown as LanguageModel;
  }

  /**
   * Gets the appropriate model instance (Google or Anthropic)
   * Creates fresh instances for each request to ensure proper authentication
   */
  private async getModel(): Promise<LanguageModelV1> {
    const modelName = this.modelName || getDefaultVertexModel();

    // Check if this is an Anthropic model
    if (isAnthropicModel(modelName)) {
      logger.debug("Creating Anthropic model for Vertex AI", { modelName });
      const anthropicModel = await this.createAnthropicModel(modelName);
      if (anthropicModel) {
        return anthropicModel;
      }
      // Fall back to regular model if Anthropic not available
      logger.warn(
        `Anthropic model ${modelName} requested but not available, falling back to Google model`,
      );
    }

    // Create fresh Google Vertex model with current settings
    logger.debug("Creating Google Vertex model", {
      modelName,
      project: this.projectId,
      location: this.location,
    });
    const vertex = createVertex(createVertexSettings());
    return vertex(modelName) as unknown as LanguageModelV1;
  }

  // executeGenerate removed - BaseProvider handles all generation with tools

  protected async executeStream(
    options: StreamOptions,
    analysisSchema?: ZodType<unknown, ZodTypeDef, unknown> | Schema<unknown>,
  ): Promise<StreamResult> {
    const functionTag = "GoogleVertexProvider.executeStream";
    let chunkCount = 0;

    try {
      this.validateStreamOptions(options);

      logger.debug(`${functionTag}: Starting stream request`, {
        modelName: this.modelName,
        promptLength: options.input.text.length,
        hasSchema: !!analysisSchema,
      });

      const model = await this.getModel();

      // Model-specific maxTokens handling
      const modelName = this.modelName || getDefaultVertexModel();
      const baseStreamOptions: Record<string, unknown> = {
        model: model,
        prompt: options.input.text,
        system: options.systemPrompt,
        temperature: options.temperature,
      };

      // Model-specific maxTokens handling
      if (modelName.includes("gemini-2.5")) {
        // Don't add maxTokens for gemini-2.5 models to avoid length finish issues
      } else {
        baseStreamOptions.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
      }

      const streamOptions = {
        ...baseStreamOptions,

        onError: (event: { error: unknown }) => {
          const error = event.error;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(`${functionTag}: Stream error`, {
            provider: this.providerName,
            modelName: this.modelName,
            error: errorMessage,
            chunkCount,
          });
        },

        onFinish: (event: {
          finishReason: string;
          usage: Record<string, unknown>;
          text?: string;
        }) => {
          logger.debug(`${functionTag}: Stream finished`, {
            finishReason: event.finishReason,
            totalChunks: chunkCount,
          });
        },

        onChunk: () => {
          chunkCount++;
        },
      } as unknown as Parameters<typeof streamText>[0];

      if (analysisSchema) {
        try {
          streamOptions.experimental_output = Output.object({
            schema: analysisSchema,
          });
        } catch (error) {
          logger.warn("Schema application failed, continuing without schema", {
            error: String(error),
          });
        }
      }

      const result = streamText(streamOptions);

      return {
        stream: (async function* () {
          for await (const chunk of result.textStream) {
            yield { content: chunk };
          }
        })(),
        provider: this.providerName,
        model: this.modelName,
      };
    } catch (error) {
      logger.error(`${functionTag}: Exception`, {
        provider: this.providerName,
        modelName: this.modelName,
        error: String(error),
        chunkCount,
      });
      throw this.handleProviderError(error);
    }
  }

  protected handleProviderError(error: unknown): Error {
    const errorRecord = error as UnknownRecord;
    if (
      typeof errorRecord?.name === "string" &&
      errorRecord.name === "TimeoutError"
    ) {
      return new TimeoutError(
        `Google Vertex AI request timed out. Consider increasing timeout or using a lighter model.`,
        this.defaultTimeout,
      );
    }

    const message =
      typeof errorRecord?.message === "string"
        ? errorRecord.message
        : "Unknown error occurred";

    if (message.includes("PERMISSION_DENIED")) {
      return new Error(
        `❌ Google Vertex AI Permission Denied\n\nYour Google Cloud credentials don't have permission to access Vertex AI.\n\nRequired Steps:\n1. Ensure your service account has Vertex AI User role\n2. Check if Vertex AI API is enabled in your project\n3. Verify your project ID is correct\n4. Confirm your location/region has Vertex AI available`,
      );
    }

    if (message.includes("NOT_FOUND")) {
      return new Error(
        `❌ Google Vertex AI Model Not Found\n\n${message}\n\nCheck:\n1. Model name is correct (e.g., 'gemini-1.5-pro')\n2. Model is available in your region (${this.location})\n3. Your project has access to the model\n4. Model supports your request parameters`,
      );
    }

    if (message.includes("QUOTA_EXCEEDED")) {
      return new Error(
        `❌ Google Vertex AI Quota Exceeded\n\n${message}\n\nSolutions:\n1. Check your Vertex AI quotas in Google Cloud Console\n2. Request quota increase if needed\n3. Try a different model or reduce request frequency\n4. Consider using a different region`,
      );
    }

    if (message.includes("INVALID_ARGUMENT")) {
      return new Error(
        `❌ Google Vertex AI Invalid Request\n\n${message}\n\nCheck:\n1. Request parameters are within model limits\n2. Input text is properly formatted\n3. Temperature and other settings are valid\n4. Model supports your request type`,
      );
    }

    return new Error(
      `❌ Google Vertex AI Provider Error\n\n${message}\n\nTroubleshooting:\n1. Check Google Cloud credentials and permissions\n2. Verify project ID and location settings\n3. Ensure Vertex AI API is enabled\n4. Check network connectivity`,
    );
  }

  private validateStreamOptions(options: StreamOptions): void {
    if (!options.input?.text?.trim()) {
      throw new Error("Prompt is required for streaming");
    }

    // Skip maxTokens validation for gemini-2.5 models as they have different behavior
    const modelName = this.modelName || getDefaultVertexModel();
    const skipMaxTokensValidation = modelName.includes("gemini-2.5");

    if (
      !skipMaxTokensValidation &&
      options.maxTokens &&
      (options.maxTokens < 1 || options.maxTokens > 8192)
    ) {
      throw new Error(
        "maxTokens must be between 1 and 8192 for Google Vertex AI",
      );
    }

    if (
      options.temperature &&
      (options.temperature < 0 || options.temperature > 2)
    ) {
      throw new Error("temperature must be between 0 and 2");
    }
  }

  /**
   * Check if Anthropic models are available
   * @returns Promise<boolean> indicating if Anthropic support is available
   */
  async hasAnthropicSupport(): Promise<boolean> {
    const createVertexAnthropic = await getCreateVertexAnthropic();
    return createVertexAnthropic !== null;
  }

  /**
   * Create an Anthropic model instance if available
   * Uses fresh vertex settings for each request
   * @param modelName Anthropic model name (e.g., 'claude-3-sonnet@20240229')
   * @returns LanguageModelV1 instance or null if not available
   */
  createAnthropicModel(modelName: string): Promise<LanguageModelV1 | null> {
    return getCreateVertexAnthropic().then((createVertexAnthropic) => {
      if (!createVertexAnthropic) {
        return null;
      }

      // Use fresh vertex settings instead of cached config
      const vertexAnthropic = (
        createVertexAnthropic as (config: unknown) => unknown
      )(createVertexSettings() as unknown);

      return (vertexAnthropic as (modelName: string) => LanguageModelV1)(
        modelName,
      );
    });
  }

  /**
   * Register a tool with the AI provider
   * @param name The name of the tool
   * @param schema The Zod schema defining the tool's parameters
   * @param description A description of what the tool does
   * @param handler The function to execute when the tool is called
   */
  registerTool(
    name: string,
    schema: ZodType<unknown>,
    description: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ): void {
    const functionTag = "GoogleVertexProvider.registerTool";

    try {
      const tool = {
        description,
        parameters: schema,
        execute: async (params: Record<string, unknown>) => {
          try {
            const contextEnrichedParams = {
              ...params,
              __context: this.toolContext,
            };
            return await handler(contextEnrichedParams);
          } catch (error) {
            logger.error(`${functionTag}: Tool execution error`, {
              toolName: name,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      };

      this.registeredTools.set(name, tool);

      logger.debug(`${functionTag}: Tool registered`, {
        toolName: name,
        modelName: this.modelName,
      });
    } catch (error) {
      logger.error(`${functionTag}: Tool registration error`, {
        toolName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Set the context for tool execution
   * @param context The context to use for tool execution
   */
  setToolContext(context: Record<string, unknown>): void {
    this.toolContext = { ...this.toolContext, ...context };
    logger.debug("GoogleVertexProvider.setToolContext: Tool context set", {
      contextKeys: Object.keys(context),
    });
  }

  /**
   * Get the current tool execution context
   * @returns The current tool execution context
   */
  getToolContext(): Record<string, unknown> {
    return { ...this.toolContext };
  }
}

export default GoogleVertexProvider;

// Re-export for compatibility
export { GoogleVertexProvider as GoogleVertexAI };
