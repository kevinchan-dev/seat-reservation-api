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
2. Run the application using Docker Compose:
   ```bash
   docker-compose up
   ```
3. The API will be available at `http://localhost:8080`
4. Swagger UI is available at `http://localhost:8080/swagger`

### Environment Variables

- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)

## Design Decisions

1. **Redis as Data Store**
   - Chosen for its fast in-memory operations
   - Built-in expiration support for seat holds
   - Atomic operations for concurrent access

2. **Fastify Framework**
   - High performance
   - Built-in schema validation
   - Swagger documentation support

3. **Data Structure**
   - Events stored as Redis hashes
   - Seats stored as Redis hashes with expiration
   - Keys follow pattern: `event:{eventId}`, `seat:{eventId}:{seatNumber}` and  `seathold:{eventId}:{seatNumber}`

4. **Concurrency Handling**
   - Redis atomic operations prevent race conditions
   - Hold expiration ensures seats don't remain locked indefinitely

5. **Error Handling**
   - Input validation using Zod
   - Proper HTTP status codes
   - Detailed error messages

## Bonus Features

1. **User Hold Limit**
   - Maximum of 5 holds per user per event
   - Prevents users from holding too many seats

2. **Hold Refresh**
   - Allows extending hold duration
   - Only available for seats held by the requesting user
