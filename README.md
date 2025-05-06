# Seat Reservation API

A REST API service for managing event seat reservations using Node.js, Fastify, and Redis.

## Features

- Create events with configurable number of seats (10-1000 inclusive)
- Hold seats for a limited time (60 seconds)
- Reserve seats that are currently held by the same user
- List available seats for an event
- Release seat after hold expiration
- User hold limit per event
- Hold refresh functionality

## API Endpoints

### Events

- `POST /api/events` - Create a new event
  ```json
  {
    "totalSeats": 100,
    "name": "Concert 2024"
  }
  ```

- `GET /api/events/:eventId` - Get event details
  ```json
  {
    "eventId": "uuid",
    "name": "Concert 2024",
    "totalSeats": 100,
    "availableSeats": 95,
    "createdAt": 1234567890
  }
  ```

- `GET /api/events` - List all events
  ```json
  {
    "events": [
      {
        "eventId": "uuid-1",
        "name": "Concert 2024",
        "totalSeats": 100,
        "availableSeats": 95,
        "createdAt": 1234567890
      },
      {
        "eventId": "uuid-2",
        "name": "Theater Show",
        "totalSeats": 50,
        "availableSeats": 45,
        "createdAt": 1234567891
      }
    ]
  }
  ```

- `DELETE /api/events/:eventId` - Delete an event and all its associated data
  ```json
  {
    "message": "Event deleted successfully"
  }
  ```

### Seats

- `POST /api/seats/:eventId/hold` - Hold (or extend the hold) a seat
  ```json
  {
    "userId": "uuid",
    "seatNumber": 1
  }
  ```

- `POST /api/seats/:eventId/reserve` - Reserve a held seat
  ```json
  {
    "userId": "uuid",
    "seatNumber": 1
  }
  ```

- `GET /api/seats/:eventId/available` - List available seats

## Development

### Prerequisites

- Docker
- Docker Compose

### Running the Application

1. Clone the repository
2. Copy `.env.example` to `.env` and adjust the values if needed:
   ```bash
   cp .env.example .env
   ```
3. Run the application using Docker Compose:
   ```bash
   docker-compose up
   ```
4. The API will be available at `http://localhost:8080`
5. Swagger UI is available at `http://localhost:8080/documentation`

### Environment Variables

The following environment variables can be configured in your `.env` file:

- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `PORT` - API server port (default: 8080)
- `HOST` - API server host (default: 0.0.0.0)
- `HOLD_DURATION` - Duration of seat holds in seconds (default: 10)
- `MAX_HOLDS_PER_USER` - Maximum number of holds per user per event (default: 5)

## Design Decisions

1. **Redis as Data Store**
   - Chosen for the requirement and its fast in-memory operations
   - Built-in expiration support for seat holds
   - Atomic operations for concurrent access

2. **Fastify Framework**
   - High performance
   - Schema validation with Zod
   - Swagger docs

3. **Data Structure**
   - Events stored as Redis hashes
   - Seats stored as Redis hashes, Seat holds with expiration
   - Keys follow pattern: `event:{eventId}`, `seat:{eventId}:{seatNumber}` and  `seathold:{eventId}:{seatNumber}`

4. **Performance Optimizations**
   - Redis pipelining for batch operations
   - Efficient key management
   - Optimized data access patterns

## Bonus Features

1. **User Hold Limit**
   - Maximum of 5 holds per user per event
   - Prevents users from holding too many seats

2. **Hold Refresh**
   - Allows extending hold duration
   - Only available for seats held by the requesting user
