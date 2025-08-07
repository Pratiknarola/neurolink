/**
 * Factory options processing utilities
 *
 * Processes factory configuration and ensures it flows through to AI providers
 */

import type { GenerateOptions } from "../types/generateTypes.js";
import type { StreamOptions } from "../types/streamTypes.js";
import type { TextGenerationOptions } from "../core/types.js";
import type { UnknownRecord, JsonValue } from "../types/common.js";
import { logger } from "./logger.js";

/**
 * Process factory configuration from enhanced options
 * Extracts and validates factory config for provider integration
 */
export function processFactoryOptions(
  options: GenerateOptions | StreamOptions,
): {
  hasFactoryConfig: boolean;
  domainType?: string;
  domainConfig?: Record<string, unknown>;
  enhancementType?: string;
  processedContext?: Record<string, JsonValue>;
} {
  const functionTag = "processFactoryOptions";

  try {
    const factoryConfig = options.factoryConfig;

    if (!factoryConfig) {
      return { hasFactoryConfig: false };
    }

    logger.debug(`[${functionTag}] Processing factory configuration`, {
      domainType: factoryConfig.domainType,
      enhancementType: factoryConfig.enhancementType,
      validateDomainData: factoryConfig.validateDomainData,
    });

    // Extract domain configuration
    const domainType = factoryConfig.domainType;
    const domainConfig = factoryConfig.domainConfig;
    const enhancementType = factoryConfig.enhancementType;

    // Create processed context that includes domain information
    const processedContext: Record<string, JsonValue> = {
      ...((options.context as Record<string, JsonValue>) || {}),
    };

    // Add domain information to context if available
    if (domainType) {
      processedContext.domainType = domainType;
    }

    if (domainConfig) {
      processedContext.domainConfig = domainConfig as JsonValue;
    }

    if (enhancementType) {
      processedContext.enhancementType = enhancementType;
    }

    // Add factory metadata
    processedContext.factoryEnhanced = true;
    processedContext.factoryProcessedAt = Date.now();

    logger.debug(
      `[${functionTag}] Factory configuration processed successfully`,
      {
        domainType,
        enhancementType,
        contextKeys: Object.keys(processedContext),
      },
    );

    return {
      hasFactoryConfig: true,
      domainType,
      domainConfig,
      enhancementType,
      processedContext,
    };
  } catch (error) {
    logger.warn(`[${functionTag}] Failed to process factory configuration`, {
      error: error instanceof Error ? error.message : String(error),
    });

    return { hasFactoryConfig: false };
  }
}

/**
 * Enhance TextGenerationOptions with factory configuration
 * Converts enhanced GenerateOptions/StreamOptions to internal format
 */
export function enhanceTextGenerationOptions(
  baseOptions: TextGenerationOptions,
  factoryResult: ReturnType<typeof processFactoryOptions>,
): TextGenerationOptions {
  if (!factoryResult.hasFactoryConfig) {
    return baseOptions;
  }

  const enhanced: TextGenerationOptions = {
    ...baseOptions,
    // Merge contexts instead of overriding to preserve provider-required context
    context: {
      ...(baseOptions.context || {}),
      ...(factoryResult.processedContext || {}),
    },
    // Ensure evaluation is enabled when using factory patterns
    enableEvaluation: baseOptions.enableEvaluation ?? true,
    // Use domain type for evaluation if available
    evaluationDomain: factoryResult.domainType || baseOptions.evaluationDomain,
  };

  logger.debug("Enhanced TextGenerationOptions with factory configuration", {
    domainType: factoryResult.domainType,
    enhancementType: factoryResult.enhancementType,
    hasProcessedContext: !!factoryResult.processedContext,
  });

  return enhanced;
}

/**
 * Check if options require factory processing
 * Quick check to determine if factory enhancement is needed
 */
export function requiresFactoryProcessing(
  options: GenerateOptions | StreamOptions | UnknownRecord,
): boolean {
  return !!(options as UnknownRecord)?.factoryConfig;
}

/**
 * Extract streaming configuration for factory processing
 * Handles streaming-specific factory enhancements
 */
export function processStreamingFactoryOptions(options: StreamOptions): {
  hasStreamingConfig: boolean;
  streamingEnabled?: boolean;
  enhancedConfig?: StreamOptions["streaming"];
} {
  const streamingConfig = options.streaming;

  if (!streamingConfig) {
    return { hasStreamingConfig: false };
  }

  logger.debug("Processing streaming factory configuration", {
    enabled: streamingConfig.enabled,
    chunkSize: streamingConfig.chunkSize,
    enableProgress: streamingConfig.enableProgress,
  });

  return {
    hasStreamingConfig: true,
    streamingEnabled: streamingConfig.enabled,
    enhancedConfig: streamingConfig,
  };
}

/**
 * Convert enhanced StreamOptions back to clean StreamOptions
 * Strips factory configuration while preserving enhanced context
 */
export function createCleanStreamOptions(
  enhancedOptions: StreamOptions,
): StreamOptions {
  const { factoryConfig, ...cleanOptions } = enhancedOptions;

  // Return clean options without factoryConfig
  return cleanOptions;
}

/**
 * Validate factory configuration
 * Ensures factory config is valid before processing
 */
export function validateFactoryConfig(
  factoryConfig: GenerateOptions["factoryConfig"],
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!factoryConfig) {
    return { isValid: true, errors: [] }; // No config is valid
  }

  // Validate domain type if present
  if (factoryConfig.domainType !== undefined) {
    if (typeof factoryConfig.domainType !== "string") {
      errors.push("domainType must be a string");
    } else if (factoryConfig.domainType.length === 0) {
      // Empty string is allowed (will be converted to "generic")
      logger.debug("Empty domainType will be converted to 'generic'");
    }
  }

  // Validate domain config if present
  if (factoryConfig.domainConfig !== undefined) {
    if (
      typeof factoryConfig.domainConfig !== "object" ||
      factoryConfig.domainConfig === null
    ) {
      errors.push("domainConfig must be an object");
    }
  }

  // Validate enhancement type if present
  if (factoryConfig.enhancementType !== undefined) {
    const validTypes = [
      "domain-configuration",
      "streaming-optimization",
      "mcp-integration",
      "legacy-migration",
      "context-conversion",
    ];

    if (!validTypes.includes(factoryConfig.enhancementType)) {
      errors.push(`enhancementType must be one of: ${validTypes.join(", ")}`);
    }
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    logger.warn("Factory configuration validation failed", { errors });
  }

  return { isValid, errors };
}
