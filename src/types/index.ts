import { FastifyInstance } from 'fastify';
import { FastifyRedis } from '@fastify/redis';

export interface FastifyInstanceWithRedis extends FastifyInstance {
  redis: FastifyRedis;
  eventService?: {
    createEvent: (name: string, totalSeats: number) => Promise<{ eventId: string; name: string; totalSeats: number; availableSeats: number; createdAt: number }>;
    getEvent: (eventId: string) => Promise<{ eventId: string; name: string; totalSeats: number; availableSeats: number; createdAt: number } | null>;
    listEvents: () => Promise<{ events: Array<{ eventId: string; name: string; totalSeats: number; availableSeats: number; createdAt: number }> }>;
    deleteEvent: (eventId: string) => Promise<{ message: string }>;
  };
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
