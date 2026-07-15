#!/bin/bash
set -e

echo "=== MADSuite E2E Setup ==="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Docker is required but not installed.${NC}"
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}Docker Compose is required but not installed.${NC}"
  exit 1
fi

# Start PostgreSQL E2E
echo -e "${YELLOW}Starting PostgreSQL E2E...${NC}"
docker-compose -f docker-compose.e2e.yml up -d postgres-e2e

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be healthy...${NC}"
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
  if docker-compose -f docker-compose.e2e.yml exec -T postgres-e2e pg_isready -U postgres -d madsuite_e2e > /dev/null 2>&1; then
    echo -e "${GREEN}PostgreSQL is ready!${NC}"
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ $attempt -eq $max_attempts ]; then
  echo -e "${RED}PostgreSQL failed to start after $max_attempts attempts${NC}"
  exit 1
fi

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/madsuite_e2e"
cd ../backend
npm run db:migrate || {
  echo -e "${RED}Migrations failed${NC}"
  exit 1
}
cd ../e2e

echo -e "${GREEN}E2E environment is ready!${NC}"
echo -e "${YELLOW}To run tests: npm run test:critical:full${NC}"
echo -e "${YELLOW}To stop services: docker-compose -f docker-compose.e2e.yml down${NC}"
