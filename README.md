# Dev.to MCP Server

A remote Model Context Protocol (MCP) server for interacting with the dev.to public API without requiring authentication.

## Features

This MCP server provides access to the following dev.to public API endpoints:

- **get_articles** - Get articles from dev.to with optional filters (username, tag, state, pagination)
- **get_article** - Get a specific article by ID or path
- **get_user** - Get user information by ID or username
- **get_tags** - Get popular tags from dev.to
- **get_comments** - Get comments for a specific article
- **search_articles** - Search articles using query parameters

## Installation

### Using npm

If you want to install and build from source using npm:

```bash
npm install
npm run build
```

## Usage

The server runs as a remote HTTP server on port 3000 (or the PORT environment variable) and can be used with any MCP-compatible client.

```bash
npm start
```

The server will be available at `http://localhost:3000` for MCP connections.

## Development

```bash
# Build the project
npm run build

# Watch mode for development
npm run dev

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

## Docker

### Pre-built Image

This fork does not currently publish a pre-built image. Image publication remains blocked until the production dependency audit passes and the upstream redistribution license is verified. Build the image from source in the meantime.

### Building from Source

Build and run the MCP server using Docker:

```bash
# Build the Docker image
docker build -t dev-to-mcp .

# Run the container
docker run -p 3000:3000 dev-to-mcp
```

### Docker Compose

The checked-in Compose file starts loopback-bound PostgreSQL/pgvector and Redis services reserved for future adapters. The MCP server still runs separately.

```bash
docker compose up -d
docker compose ps
npm run dev
```

## API Endpoints

All endpoints use the public dev.to API (`https://dev.to/api`) and do not require authentication.

### get_articles

Get articles with optional filtering:

- `username` - Filter by author username
- `tag` - Filter by tag
- `top` - Top articles (1, 7, 30, or infinity days)
- `page` - Pagination page (default: 1)
- `per_page` - Articles per page (default: 30, max: 1000)
- `state` - Filter by state (fresh, rising, all)

### get_article

Get a specific article:

- `id` - Article ID
- `path` - Article path (e.g., "username/article-slug")

### get_user

Get user information:

- `id` - User ID
- `username` - Username

### get_tags

Get popular tags:

- `page` - Pagination page (default: 1)
- `per_page` - Tags per page (default: 10, max: 1000)

### get_comments

Get comments for an article:

- `article_id` - Article ID (required)

### search_articles

Search articles:

- `q` - Search query (required)
- `page` - Pagination page (default: 1)
- `per_page` - Articles per page (default: 30, max: 1000)
- `search_fields` - Fields to search (title, body_text, tag_list)

## License

No repository-level license grant has been verified for the upstream source. Although package metadata labels the project MIT, do not redistribute source or images until provenance and licensing are confirmed.
