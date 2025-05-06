import { FastifyInstance } from 'fastify';
import { FastifyRedis } from '@fastify/redis';
import { EventService } from '../services/eventService.js';

export interface FastifyInstanceWithRedis extends FastifyInstance {
  redis: FastifyRedis;
  eventService?: EventService;
}

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
