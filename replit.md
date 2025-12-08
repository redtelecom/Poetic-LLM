# Poetiq Solver

## Overview

Poetiq Solver is a multi-model AI orchestration system designed for complex reasoning tasks. The application uses adaptive LLM orchestration inspired by Poetiq's breakthrough approach, allowing users to leverage multiple AI providers (OpenAI and Anthropic) to solve challenging problems through iterative refinement and multi-step reasoning.

The system is built as a full-stack web application with a React frontend and Express backend, using PostgreSQL for data persistence. It features a conversational interface where users can submit reasoning tasks and observe the AI's step-by-step problem-solving process across multiple models.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool and development server.

**UI Component Library**: The application uses shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling. This provides a consistent, accessible, and customizable design system throughout the application.

**State Management**: 
- TanStack Query (React Query) for server state management and caching
- Local React state for component-level state
- No global state management library (Redux, Zustand, etc.) is used

**Routing**: The application uses wouter for client-side routing, a lightweight alternative to React Router.

**Design Rationale**: The frontend architecture prioritizes developer experience and performance. Vite provides fast hot module replacement during development. The component-based approach with shadcn/ui allows for rapid UI development while maintaining consistency. TanStack Query handles API caching and synchronization automatically, reducing boilerplate code.

### Backend Architecture

**Framework**: Express.js with TypeScript running on Node.js.

**API Design**: RESTful API endpoints for CRUD operations on conversations, messages, and settings. Server-Sent Events or streaming responses for real-time AI reasoning step updates.

**Database ORM**: Drizzle ORM is used for type-safe database interactions with PostgreSQL.

**Build System**: The production build uses esbuild to bundle the server code with selective dependencies (via allowlist) for optimized cold start times.

**Development Workflow**: In development, the backend serves the Vite dev server through middleware, providing a unified development experience. In production, the backend serves pre-built static assets from the dist/public directory.

**Design Rationale**: Express provides a mature, flexible foundation for the API server. TypeScript ensures type safety across the full stack. The strategic bundling of dependencies reduces the number of file system operations on cold starts, improving serverless deployment performance. Drizzle ORM provides excellent TypeScript integration and migration support.

### Data Storage

**Database**: PostgreSQL is the primary data store.

**Schema Design**:
- `conversations`: Stores conversation metadata (id, title, timestamps)
- `messages`: Contains individual messages within conversations with role (user/assistant), content, and metadata
- `reasoning_steps`: Tracks individual reasoning steps with provider information, model used, action type, and step number
- `settings`: Stores user configuration for AI providers (enabled state, selected models)

**Database Access Pattern**: The storage layer is abstracted through an IStorage interface, implemented by PostgresStorage. This abstraction allows for easier testing and potential future storage backend changes.

**Design Rationale**: PostgreSQL provides ACID guarantees and powerful querying capabilities. The schema is normalized to reduce data redundancy while maintaining queryability. Foreign key constraints with cascade deletes ensure data integrity. JSONB fields are used for flexible metadata storage without requiring schema migrations for new properties.

### AI Orchestration System

**Core Component**: PoetiqOrchestrator class manages multi-model AI interactions.

**Supported Providers**:
- OpenAI (GPT-5, GPT-4o, GPT-4o-mini)
- Anthropic (Claude Opus 4.5, Claude Sonnet 4.5, Claude Haiku 4.5)

**Orchestration Strategy**:
- Single-model mode: When only one provider is enabled, streams responses directly from that provider
- Multi-model mode: When multiple providers are enabled, implements iterative refinement where one model proposes solutions and another critiques/refines them

**Streaming Architecture**: The system uses async generators to stream AI responses in real-time, providing immediate feedback to users as the AI processes their requests.

**Design Rationale**: The orchestrator pattern allows for flexible provider management and easy addition of new AI providers. Streaming responses improve perceived performance and provide transparency into the reasoning process. The multi-model approach leverages the strengths of different AI systems for more robust problem-solving.

## External Dependencies

### AI Provider APIs

**OpenAI API**: 
- Models: GPT-5, GPT-4o, GPT-4o-mini
- Configuration: Base URL and API key via environment variables (AI_INTEGRATIONS_OPENAI_BASE_URL, AI_INTEGRATIONS_OPENAI_API_KEY)
- Usage: Primary AI provider for reasoning tasks

**Anthropic API**:
- Models: Claude Opus 4.5, Claude Sonnet 4.5, Claude Haiku 4.5
- Configuration: Base URL and API key via environment variables (AI_INTEGRATIONS_ANTHROPIC_BASE_URL, AI_INTEGRATIONS_ANTHROPIC_API_KEY)
- Usage: Alternative AI provider for reasoning tasks and multi-model orchestration

### Database

**PostgreSQL**:
- Configuration: Connection string via DATABASE_URL environment variable
- Purpose: Primary data persistence layer for conversations, messages, reasoning steps, and settings
- Connection Management: Uses pg Pool for connection pooling

### Third-Party Services and Libraries

**UI Components**:
- Radix UI: Unstyled, accessible component primitives
- Tailwind CSS: Utility-first CSS framework
- Lucide React: Icon library

**Development Tools**:
- Vite: Frontend build tool and dev server
- Replit-specific plugins: Runtime error modal, cartographer, dev banner for development environment integration

**Build and Deployment**:
- esbuild: Production server bundling
- Drizzle Kit: Database migration management

**Design Rationale**: Environment-based configuration allows for easy deployment across different environments. The dependency allowlist in the build process is strategically chosen to bundle commonly-used dependencies that would otherwise cause many file system lookups, improving cold start performance on serverless platforms.