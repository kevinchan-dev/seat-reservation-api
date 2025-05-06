import { Redis } from 'ioredis';

export class RedisService {
  constructor(private readonly redis: Redis) {}

  async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async hset(key: string, data: Record<string, string | number>): Promise<number> {
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
}
