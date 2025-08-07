/**
 * Options Enhancement Utilities
 * Provides intelligent enhancement of GenerateOptions with factory patterns
 * Supports domain configuration, streaming optimization, and MCP integration
 */

import type {
  GenerateOptions,
  UnifiedGenerationOptions,
} from "../types/generateTypes.js";
import type { StreamOptions } from "../types/streamTypes.js";
import type { ExecutionContext } from "../mcp/contracts/mcpContract.js";
import { ContextConverter } from "../types/contextTypes.js";
import { logger } from "./logger.js";

/**
 * Enhancement types for different optimization strategies
 */
export type EnhancementType =
  | "streaming-optimization"
  | "mcp-integration"
  | "legacy-migration"
  | "context-conversion";

/**
 * Enhancement options for modifying GenerateOptions
 */
export interface EnhancementOptions {
  enhancementType: EnhancementType;
  streamingOptions?: {
    enabled?: boolean;
    chunkSize?: number;
    bufferSize?: number;
    enableProgress?: boolean;
    preferStreaming?: boolean;
  };
  mcpOptions?: {
    enableToolRegistry?: boolean;
    contextAware?: boolean;
    executionContext?: ExecutionContext;
  };
  legacyMigration?: {
    legacyContext?: Record<string, unknown>;
    domainType?: string;
    preserveFields?: boolean;
  };
  performance?: {
    enableAnalytics?: boolean;
    enableEvaluation?: boolean;
    timeout?: number;
  };
}

/**
 * Enhancement result with metadata
 */
export interface EnhancementResult {
  options: UnifiedGenerationOptions;
  metadata: {
    enhancementApplied: boolean;
    enhancementType: EnhancementType;
    processingTime: number;
    configurationUsed: Record<string, unknown>;
    warnings: string[];
    recommendations: string[];
  };
}

/**
 * Options Enhancement Utility Class
 * Main utility for enhancing GenerateOptions with factory patterns
 */
export class OptionsEnhancer {
  private static enhancementCount = 0;

  /**
   * Enhance GenerateOptions with factory patterns
   * Primary method for applying enhancements
   */
  static enhance(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): EnhancementResult {
    const startTime = Date.now();
    this.enhancementCount++;

    logger.debug(
      `Enhancing options with ${enhancementOptions.enhancementType} (count: ${this.enhancementCount})`,
    );

    try {
      const result = this.applyEnhancement(options, enhancementOptions);
      const processingTime = Date.now() - startTime;

      logger.debug(
        `Enhancement completed in ${processingTime}ms: ${enhancementOptions.enhancementType}`,
      );

      return {
        ...result,
        metadata: {
          ...result.metadata,
          processingTime,
        },
      };
    } catch (error) {
      logger.error(`Enhancement failed: ${error}`);
      return this.createErrorResult(options, enhancementOptions, startTime);
    }
  }


  /**
   * Enhance options for streaming optimization
   * Specialized method for streaming enhancements
   */
  static enhanceForStreaming(
    options: GenerateOptions,
    streamingConfig?: {
      chunkSize?: number;
      bufferSize?: number;
      enableProgress?: boolean;
    },
  ): EnhancementResult {
    return this.enhance(options, {
      enhancementType: "streaming-optimization",
      streamingOptions: {
        enabled: true,
        preferStreaming: true,
        ...streamingConfig,
      },
    });
  }

  /**
   * Convert legacy business context to factory options
   * Migration utility for existing business-specific code
   */
  static migrateFromLegacy(
    options: GenerateOptions,
    legacyContext: Record<string, unknown>,
    domainType: string,
  ): EnhancementResult {
    return this.enhance(options, {
      enhancementType: "legacy-migration",
      legacyMigration: {
        legacyContext: legacyContext,
        domainType,
        preserveFields: true,
      },
      performance: {
        enableEvaluation: true,
        enableAnalytics: true,
      },
    });
  }

  /**
   * Create unified options from separate generation and streaming options
   * Utility for combining different option types
   */
  static createUnified(
    generateOptions: GenerateOptions,
    streamOptions?: Partial<StreamOptions>,
  ): UnifiedGenerationOptions {
    const unified: UnifiedGenerationOptions = {
      ...generateOptions,
      preferStreaming: false,
      streamingFallback: true,
    };

    if (streamOptions) {
      unified.streaming = {
        enabled: true,
        chunkSize: streamOptions.output?.streaming?.chunkSize,
        bufferSize: streamOptions.output?.streaming?.bufferSize,
        enableProgress: streamOptions.output?.streaming?.enableProgress,
        fallbackToGenerate: true,
      };
      unified.preferStreaming = true;
    }

    return unified;
  }

  /**
   * Validate enhancement compatibility
   * Check if enhancement options are compatible with base options
   */
  static validateEnhancement(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): {
    valid: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check for conflicting configurations
    if (
      enhancementOptions.enhancementType === "streaming-optimization" &&
      options.disableTools
    ) {
      warnings.push(
        "Streaming optimization with disabled tools may reduce effectiveness",
      );
      recommendations.push(
        "Consider enabling tools for better streaming performance",
      );
    }


    // Check legacy migration requirements
    if (
      enhancementOptions.enhancementType === "legacy-migration" &&
      !enhancementOptions.legacyMigration?.legacyContext
    ) {
      return {
        valid: false,
        warnings: [
          "Legacy migration requested but no legacy context provided",
        ],
        recommendations: ["Provide legacyContext for legacy migration"],
      };
    }

    return {
      valid: true,
      warnings,
      recommendations,
    };
  }

  // Private helper methods

  private static applyEnhancement(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): EnhancementResult {
    const validation = this.validateEnhancement(options, enhancementOptions);

    if (!validation.valid) {
      throw new Error(
        `Enhancement validation failed: ${validation.warnings.join(", ")}`,
      );
    }

    switch (enhancementOptions.enhancementType) {
      case "streaming-optimization":
        return this.applyStreamingOptimization(options, enhancementOptions);

      case "mcp-integration":
        return this.applyMcpIntegration(options, enhancementOptions);

      case "legacy-migration":
        return this.applyLegacyMigration(options, enhancementOptions);

      case "context-conversion":
        return this.applyContextConversion(options, enhancementOptions);

      default:
        throw new Error(
          `Unknown enhancement type: ${enhancementOptions.enhancementType}`,
        );
    }
  }


  private static applyStreamingOptimization(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): EnhancementResult {
    const streamingOptions = enhancementOptions.streamingOptions || {};

    const unifiedOptions: UnifiedGenerationOptions = {
      ...options,
      streaming: {
        enabled: streamingOptions.enabled ?? true,
        chunkSize: streamingOptions.chunkSize || 1024,
        bufferSize: streamingOptions.bufferSize || 4096,
        enableProgress: streamingOptions.enableProgress ?? true,
        fallbackToGenerate: true,
      },
      preferStreaming: streamingOptions.preferStreaming ?? true,
      streamingFallback: true,
    };

    // Apply performance optimizations
    if (enhancementOptions.performance?.enableAnalytics) {
      unifiedOptions.enableAnalytics = true;
    }

    return {
      options: unifiedOptions,
      metadata: {
        enhancementApplied: true,
        enhancementType: "streaming-optimization",
        processingTime: 0,
        configurationUsed: streamingOptions,
        warnings: [],
        recommendations: [
          "Monitor streaming performance for optimal chunk size tuning",
        ],
      },
    };
  }

  private static applyMcpIntegration(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): EnhancementResult {
    const mcpOptions = enhancementOptions.mcpOptions || {};

    const unifiedOptions: UnifiedGenerationOptions = {
      ...options,
      preferStreaming: false,
      streamingFallback: true,
    };

    // Enhance with MCP context if provided
    if (mcpOptions.executionContext) {
      unifiedOptions.context = {
        ...unifiedOptions.context,
        mcpContext: mcpOptions.executionContext,
        mcpIntegrationEnabled: true,
      };
    }

    // Enable tools if MCP integration is requested
    if (mcpOptions.enableToolRegistry && options.disableTools) {
      unifiedOptions.disableTools = false;
      logger.info("Enabled tools for MCP integration");
    }

    return {
      options: unifiedOptions,
      metadata: {
        enhancementApplied: true,
        enhancementType: "mcp-integration",
        processingTime: 0,
        configurationUsed: mcpOptions,
        warnings: [],
        recommendations: [
          "Ensure MCP tools are properly configured for optimal integration",
        ],
      },
    };
  }

  private static applyLegacyMigration(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): EnhancementResult {
    const legacyMigration = enhancementOptions.legacyMigration!;

    // Convert legacy context to execution context
    const executionContext = ContextConverter.convertBusinessContext(
      legacyMigration.legacyContext!,
      legacyMigration.domainType!,
      {
        preserveLegacyFields: legacyMigration.preserveFields,
        validateDomainData: true,
        includeMetadata: true,
      },
    );

    const unifiedOptions: UnifiedGenerationOptions = {
      ...options,
      context: {
        ...options.context,
        legacyMigration: true,
        executionContext,
        originalLegacyContext: legacyMigration.legacyContext,
      },
      factoryConfig: {
        domainType: legacyMigration.domainType,
        enhancementType: "legacy-migration",
        preserveLegacyFields: legacyMigration.preserveFields,
        validateDomainData: true,
      },
      preferStreaming: false,
      streamingFallback: true,
    };

    // Apply performance settings
    if (enhancementOptions.performance?.enableEvaluation) {
      unifiedOptions.enableEvaluation = true;
      unifiedOptions.evaluationDomain = legacyMigration.domainType;
    }

    if (enhancementOptions.performance?.enableAnalytics) {
      unifiedOptions.enableAnalytics = true;
    }

    return {
      options: unifiedOptions,
      metadata: {
        enhancementApplied: true,
        enhancementType: "legacy-migration",
        processingTime: 0,
        configurationUsed: {
          domainType: legacyMigration.domainType,
          preserveFields: legacyMigration.preserveFields,
          legacyContextKeys: Object.keys(legacyMigration.legacyContext!),
        },
        warnings: [],
        recommendations: [
          "Review migrated context for completeness",
          "Consider gradually removing legacy field dependencies",
        ],
      },
    };
  }

  private static applyContextConversion(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
  ): EnhancementResult {
    // Context conversion is a specialized form of enhancement
    const unifiedOptions: UnifiedGenerationOptions = {
      ...options,
      preferStreaming: false,
      streamingFallback: true,
    };

    return {
      options: unifiedOptions,
      metadata: {
        enhancementApplied: true,
        enhancementType: "context-conversion",
        processingTime: 0,
        configurationUsed: {},
        warnings: [],
        recommendations: [],
      },
    };
  }

  private static createErrorResult(
    options: GenerateOptions,
    enhancementOptions: EnhancementOptions,
    startTime: number,
  ): EnhancementResult {
    const unifiedOptions: UnifiedGenerationOptions = {
      ...options,
      preferStreaming: false,
      streamingFallback: true,
    };

    return {
      options: unifiedOptions,
      metadata: {
        enhancementApplied: false,
        enhancementType: enhancementOptions.enhancementType,
        processingTime: Date.now() - startTime,
        configurationUsed: {},
        warnings: ["Enhancement failed - using original options"],
        recommendations: ["Check enhancement configuration and try again"],
      },
    };
  }

  /**
   * Get enhancement statistics
   * Utility for monitoring enhancement usage
   */
  static getStatistics(): {
    enhancementCount: number;
    lastReset: number;
  } {
    return {
      enhancementCount: this.enhancementCount,
      lastReset: Date.now(),
    };
  }

  /**
   * Reset enhancement statistics
   * Utility for clearing counters
   */
  static resetStatistics(): void {
    this.enhancementCount = 0;
    logger.debug("Enhancement statistics reset");
  }
}

/**
 * Convenience functions for common enhancement patterns
 */


/**
 * Quick streaming enhancement
 * Simplified interface for streaming optimization
 */
export function enhanceForStreaming(
  options: GenerateOptions,
  chunkSize: number = 1024,
): EnhancementResult {
  return OptionsEnhancer.enhanceForStreaming(options, {
    chunkSize,
    enableProgress: true,
  });
}

/**
 * Quick legacy migration
 * Simplified interface for legacy context migration
 */
export function migrateLegacyContext(
  options: GenerateOptions,
  legacyContext: Record<string, unknown>,
  domainType: string,
): EnhancementResult {
  return OptionsEnhancer.migrateFromLegacy(
    options,
    legacyContext,
    domainType,
  );
}

/**
 * Batch enhancement utility
 * Apply multiple enhancements in sequence
 */
export function batchEnhance(
  options: GenerateOptions,
  enhancements: EnhancementOptions[],
): EnhancementResult {
  let currentOptions = options;
  let finalResult: EnhancementResult | null = null;
  const allWarnings: string[] = [];
  const allRecommendations: string[] = [];
  let totalProcessingTime = 0;

  for (const enhancement of enhancements) {
    const result = OptionsEnhancer.enhance(currentOptions, enhancement);
    currentOptions = result.options;
    finalResult = result;

    allWarnings.push(...result.metadata.warnings);
    allRecommendations.push(...result.metadata.recommendations);
    totalProcessingTime += result.metadata.processingTime;
  }

  if (finalResult) {
    finalResult.metadata.warnings = [...new Set(allWarnings)];
    finalResult.metadata.recommendations = [...new Set(allRecommendations)];
    finalResult.metadata.processingTime = totalProcessingTime;
    finalResult.metadata.enhancementType =
      "batch-enhancement" as EnhancementType;
  }

  return finalResult || OptionsEnhancer.enhance(options, enhancements[0]);
}
