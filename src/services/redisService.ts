import { Redis, ChainableCommander } from 'ioredis';

// Redis key patterns
export const REDIS_KEYS = {
  EVENT: 'event:{eventId}',
  SEAT: 'seat:{eventId}:{seatNumber}',
  SEAT_HOLD: 'seathold:{eventId}:{seatNumber}',
} as const;

// Type for Redis hash data
export type RedisHashData = Record<string, string | number>;

// Type for batch operations
export type BatchSetEntry = {
  key: string;
  data: RedisHashData;
};

export class RedisService {
  constructor(private readonly redis: Redis) {}

  // Helper method to format Redis keys
  private formatKey(pattern: string, params: Record<string, string | number>): string {
    return Object.entries(params).reduce(
      (key, [param, value]) => key.replace(`{${param}}`, String(value)),
      pattern
    );
  }

  // Event-related methods
  getEventKey(eventId: string): string {
    return this.formatKey(REDIS_KEYS.EVENT, { eventId });
  }

  getSeatKey(eventId: string, seatNumber: number): string {
    return this.formatKey(REDIS_KEYS.SEAT, { eventId, seatNumber });
  }

  getSeatHoldKey(eventId: string, seatNumber: number): string {
    return this.formatKey(REDIS_KEYS.SEAT_HOLD, { eventId, seatNumber });
  }

  // Basic Redis operations
  async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async hset(key: string, data: RedisHashData): Promise<number> {
    return this.redis.hset(key, data);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds);
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.redis.hincrby(key, field, increment);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  // Pipeline operations
  createPipeline(): ChainableCommander {
    return this.redis.pipeline();
  }

  async batchGet(keys: string[]): Promise<Record<string, Record<string, string>>> {
    const pipeline = this.createPipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }
    const results = await pipeline.exec();
    const data: Record<string, Record<string, string>> = {};

    if (results) {
      for (let i = 0; i < results.length; i++) {
        const [err, result] = results[i];
        if (!err && result) {
          data[keys[i]] = result as Record<string, string>;
        }
      }
    }

    return data;
  }

  async batchSet(entries: BatchSetEntry[]): Promise<void> {
    const pipeline = this.createPipeline();
    for (const { key, data } of entries) {
      pipeline.hset(key, data);
    }
    await pipeline.exec();
  }

  async batchDelete(keys: string[]): Promise<void> {
    const pipeline = this.createPipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    await pipeline.exec();
  }
}
