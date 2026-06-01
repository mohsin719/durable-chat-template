type AsyncMethod = (...args: unknown[]) => Promise<unknown>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function Retry(maxAttempts = 3, baseDelayMs = 500): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const original = descriptor.value as AsyncMethod;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await original.apply(this, args);
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            const backoff = baseDelayMs * Math.pow(2, attempt - 1);
            await sleep(backoff);
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}
