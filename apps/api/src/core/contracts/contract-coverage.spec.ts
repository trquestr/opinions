import { Controller, Get } from '@nestjs/common';
import { MetadataScanner, type DiscoveryService } from '@nestjs/core';
import { defineEndpoint } from '@opinions/contracts';
import { z } from 'zod';
import { ContractCoverage } from './contract-coverage.js';
import { Endpoint } from './endpoint.decorator.js';

const contract = defineEndpoint({ method: 'GET', path: '/ok', access: 'public', response: z.object({}) });

@Controller()
class Covered {
  @Endpoint(contract)
  ok() {
    return {};
  }

  // Не маршрут — проверка его не касается.
  helper() {
    return 1;
  }
}

@Controller()
class Uncovered {
  @Get('raw')
  raw() {
    return {};
  }
}

function coverage(...controllers: Array<new () => object>): ContractCoverage {
  const discovery = {
    getControllers: () => [
      ...controllers.map((Controller) => ({ instance: new Controller(), metatype: Controller })),
      { instance: undefined, metatype: undefined },
    ],
  } as unknown as DiscoveryService;
  return new ContractCoverage(discovery, new MetadataScanner());
}

describe('ContractCoverage', () => {
  it('все маршруты с @Endpoint: старт проходит', () => {
    expect(() => coverage(Covered).onApplicationBootstrap()).not.toThrow();
  });

  it('маршрут без @Endpoint: ошибка с именем класса и метода', () => {
    expect(() => coverage(Covered, Uncovered).onApplicationBootstrap()).toThrow(/Uncovered\.raw/);
  });
});
