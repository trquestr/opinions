import { Controller } from '@nestjs/common';
import { defineEndpoint } from '@opinions/contracts';
import { z } from 'zod';
import { ContractBody, ContractParams, ContractQuery } from './contract-params.js';
import { Endpoint } from './endpoint.decorator.js';

const contract = defineEndpoint({
  method: 'POST',
  path: '/things/:id',
  access: 'public',
  params: z.object({ id: z.string() }),
  query: z.object({ q: z.string().optional() }),
  body: z.object({ a: z.string() }),
  response: z.object({}),
});

@Controller()
class Sample {
  @Endpoint(contract)
  update(
    @ContractParams(contract) _params: unknown,
    @ContractQuery(contract) _query: unknown,
    @ContractBody(contract) _body: unknown,
  ) {
    return {};
  }
}

describe('Contract*-декораторы', () => {
  it('навешивают схемы контракта на параметры обработчика', () => {
    const args: Record<string, { schema?: unknown }> = Reflect.getMetadata(
      '__routeArguments__',
      Sample,
      'update',
    );
    const schemas = Object.values(args).map((arg) => arg.schema);
    expect(schemas).toHaveLength(3);
    expect(schemas).toEqual(expect.arrayContaining([contract.params, contract.query, contract.body]));
  });
});
