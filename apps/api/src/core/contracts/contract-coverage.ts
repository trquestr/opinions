import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { ENDPOINT_CONTRACT } from './endpoint.decorator.js';

// Метаданные маршрута, которые ставят @Get/@Post/… (значения констант @nestjs/common).
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

/**
 * Страховка от «нетипизированной ручки»: на старте обходит все контроллеры, и если у обработчика маршрута
 * нет `@Endpoint(contract)`, приложение не поднимается. Так guard доступа и сериализация ответа
 * гарантированно работают для каждой ручки.
 */
@Injectable()
export class ContractCoverage implements OnApplicationBootstrap {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    const uncovered: string[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;
        const isRoute =
          Reflect.hasMetadata(PATH_METADATA, handler) && Reflect.hasMetadata(METHOD_METADATA, handler);
        if (isRoute && !Reflect.hasMetadata(ENDPOINT_CONTRACT, handler)) {
          uncovered.push(`${metatype.name}.${methodName}`);
        }
      }
    }
    if (uncovered.length > 0) {
      throw new Error(
        `Обработчики без @Endpoint(contract): ${uncovered.join(', ')}. Каждая ручка обязана иметь контракт.`,
      );
    }
  }
}
