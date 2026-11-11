import { Controller } from '@nestjs/common';
import { defineEndpoint } from '@opinions/contracts';
import { z } from 'zod';
import { ENDPOINT_CONTRACT, Endpoint } from './endpoint.decorator.js';

const getContract = defineEndpoint({
  method: 'GET',
  path: '/things',
  access: 'public',
  response: z.object({}),
});
const postContract = defineEndpoint({
  method: 'POST',
  path: '/things',
  access: 'user',
  status: 201,
  body: z.object({ a: z.string() }),
  response: z.object({}),
});

@Controller()
class Sample {
  @Endpoint(getContract)
  list() {
    return {};
  }

  @Endpoint(postContract)
  create() {
    return {};
  }
}

const handler = (name: string): object => {
  const value: unknown = Reflect.get(Sample.prototype, name);
  if (typeof value !== 'function') throw new Error(`нет метода ${name}`);
  return value;
};

describe('Endpoint', () => {
  it('кладёт контракт в метаданные обработчика', () => {
    expect(Reflect.getMetadata(ENDPOINT_CONTRACT, handler('list'))).toBe(getContract);
    expect(Reflect.getMetadata(ENDPOINT_CONTRACT, handler('create'))).toBe(postContract);
  });

  it('задаёт маршрут и метод из контракта', () => {
    expect(Reflect.getMetadata('path', handler('list'))).toBe('/things');
    expect(Reflect.getMetadata('method', handler('list'))).toBe(0); // RequestMethod.GET
    expect(Reflect.getMetadata('method', handler('create'))).toBe(1); // RequestMethod.POST
  });

  it('задаёт код успеха: 200 по умолчанию, иначе из контракта', () => {
    expect(Reflect.getMetadata('__httpCode__', handler('list'))).toBe(200);
    expect(Reflect.getMetadata('__httpCode__', handler('create'))).toBe(201);
  });
});
