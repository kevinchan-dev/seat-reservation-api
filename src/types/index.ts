import { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';

export type FastifyInstanceWithRedis = FastifyInstance & {
  redis: Redis;
};

export interface Event {
  id: string;
  name: string;
  totalSeats: number;
  createdAt: string;
}

export interface Seat {
  number: number;
  status: 'available' | 'reserved';
  userId?: string;
  holdId?: string;
  expiresAt?: string;
}

export interface HoldSeatRequest {
  userId: string;
  seatNumber: number;
}

export interface ReserveSeatRequest {
  userId: string;
  seatNumber: number;
}

export interface RouteOptions {
  prefix: string;
}
