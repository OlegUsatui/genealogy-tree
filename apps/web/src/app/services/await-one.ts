interface SubscribableLike<T> {
  subscribe(observer: {
    next: (value: T) => void;
    error: (error: unknown) => void;
  }): unknown;
}

export function awaitOne<T>(source: SubscribableLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.subscribe({
      next: (value) => resolve(value),
      error: (error) => reject(error),
    });
  });
}

