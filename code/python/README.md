# PSTN2 Python SDK

Python implementation of the PSTN2 distributed telecommunications protocol.

> **Status: reference API — not yet on PyPI.** The `pstn2` package has not
> been published, so `pip install pstn2` will not work yet. The examples in
> `examples/` and the snippets below illustrate the *intended* SDK surface.

## Installation

Once the SDK is published to PyPI, installation will be:

```bash
pip install pstn2
# or
poetry add pstn2
# or
uv add pstn2
```

## Requirements

- Python 3.11 or later
- Dependencies: `httpx`, `cryptography`, `pydantic`

## Quick Start

```python
import asyncio
import os

from pstn2.client import PSTN2Client, AuthenticationMode

async def main():
    client = PSTN2Client(
        cp_id='CP1-UK-0001',
        api_endpoint='https://api.yourcp.com/pstn2/v1',
        private_key=os.environ['PSTN2_PRIVATE_KEY'],
        auth_mode=AuthenticationMode.DIRECT_QUERY,
    )

    # Verify an inbound call
    verification = await client.auth.verify_call(
        caller_id='+441234567890',
        called_id='+447700900123',
        call_reference='abc-123-def-456',
    )

    print(f'Call verified: {verification.verified}')

    await client.close()

asyncio.run(main())
```

## Features

- ✅ **Authentication**: Verify caller IDs using Direct Query or Token Pool
- ✅ **Direct Routing**: Discover peer-to-peer routing paths
- ✅ **End-to-End Encryption**: Per-call key exchange with Ed25519
- ✅ **Call Branding**: Display verified caller information
- ✅ **Emergency Services**: Real-time GPS location for 999/112/911 calls
- ✅ **Directory Service**: Distributed number directory lookups
- ✅ **Async/Await**: Built on modern Python asyncio
- ✅ **Type Safety**: Full type hints with Pydantic models

## Project Setup

### Using pip

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install package
pip install pstn2
```

### Using Poetry

```bash
# Initialize project
poetry new my-pstn2-app
cd my-pstn2-app

# Add dependency
poetry add pstn2

# Activate shell
poetry shell
```

### Using uv (Recommended for speed)

```bash
# Create project
uv init my-pstn2-app
cd my-pstn2-app

# Add dependency
uv add pstn2

# Run script
uv run python main.py
```

## Running Examples

1. Set environment variables:
```bash
export PSTN2_PRIVATE_KEY="your-private-key-here"
export CP1_PRIVATE_KEY="your-cp1-key-here"
export PSAP_PRIVATE_KEY="your-psap-key-here"
export TOKEN_POOL_JWT="your-jwt-token-here"
```

2. Run an example:
```bash
python examples/01_basic_authentication.py
python examples/02_direct_routing.py
python examples/03_token_pool.py
python examples/04_emergency_services.py
python examples/05_complete_call_flow.py
```

## SDK API Reference

### PSTN2Client

```python
from pstn2.client import PSTN2Client, AuthenticationMode

client = PSTN2Client(
    cp_id='CP1-UK-0001',
    api_endpoint='https://api.yourcp.com/pstn2/v1',
    private_key=os.environ['PSTN2_PRIVATE_KEY'],
    auth_mode=AuthenticationMode.DIRECT_QUERY,
    timeout=2.0,  # seconds
    retries=3,
    log_level='info',
)
```

### Authentication Module

```python
# Verify call (Direct Query)
verification = await client.auth.verify_call(
    caller_id='+441234567890',
    called_id='+447700900123',
    call_reference='abc-123-def-456',
)

# Create token (Token Pool)
token = await client.auth.create_token(
    caller_id='+441234567890',
    called_id='+447700900123',
    call_reference='token-call-123',
    ttl=30,  # seconds
)

# Verify token
verification = await client.auth.verify_token(token.token_id)
```

### Routing Module

```python
from pstn2.types import MediaCapabilities, CallBranding

routing = await client.routing.request_routing(
    destination_number='+447700900123',
    caller_id='+441234567890',
    call_reference='xyz-789-abc-012',
    media_capabilities=MediaCapabilities(
        codecs=['opus', 'g722', 'pcmu'],
        encryption=['srtp-aes256', 'srtp-aes128'],
        video=False,
        max_bandwidth=128000,
    ),
    branding=CallBranding(
        display_name='ACME Support',
        logo='https://cdn.acme.com/logo.png',
        background_color='#0066cc',
        call_purpose='Account Security Alert',
    ),
)
```

### Directory Module

```python
# Lookup number
cp_info = await client.directory.lookup('+441234567890')
print(f'Hosted by: {cp_info.cp_id}')

# Reverse lookup
ranges = await client.directory.reverse('CP1-UK-0001')
```

### Emergency Module

```python
# Get caller location (PSAP only)
location = await client.emergency.get_location(
    caller_id='+441234567890',
    call_reference='emergency-456-789',
    psap_id='UK-999-LONDON-CENTRAL',
)

print(f'GPS: {location.location.latitude}, {location.location.longitude}')
print(f'Accuracy: {location.location.accuracy}m')
```

## Type Safety with Pydantic

All SDK models use Pydantic for validation:

```python
from pstn2.types import (
    VerifyCallRequest,
    VerifyCallResponse,
    MediaCapabilities,
    CallBranding,
)

# Type-safe requests
request = VerifyCallRequest(
    caller_id='+441234567890',
    called_id='+447700900123',
    call_reference='abc-123',
)

# IDE auto-completion for responses
response: VerifyCallResponse = await client.auth.verify_call(**request.dict())
print(response.verified)
print(response.trust_level)
```

## Error Handling

```python
from pstn2.exceptions import (
    PSTN2Error,
    AuthenticationError,
    RoutingError,
    NetworkError,
)

try:
    verification = await client.auth.verify_call(...)
except AuthenticationError as e:
    print(f'Authentication failed: {e}')
except NetworkError as e:
    print(f'Network error: {e}')
except PSTN2Error as e:
    print(f'PSTN2 error: {e}')
```

## Best Practices

### 1. Use Environment Variables

```python
import os

# ✅ Good
private_key = os.environ['PSTN2_PRIVATE_KEY']

# ❌ Bad
private_key = 'hardcoded-key'
```

### 2. Always Close Clients

```python
client = PSTN2Client(...)

try:
    result = await client.auth.verify_call(...)
finally:
    await client.close()
```

Or use context manager:

```python
async with PSTN2Client(...) as client:
    result = await client.auth.verify_call(...)
```

### 3. Handle Errors Gracefully

```python
try:
    routing = await client.routing.request_routing(...)
    if routing.accepted:
        # Use PSTN2
        pass
    else:
        # Fall back to PSTN
        pass
except Exception as e:
    # Always provide fallback
    print(f'Error: {e}, falling back to PSTN')
```

## Integration Examples

### FastAPI Integration

```python
from fastapi import FastAPI, HTTPException
from pstn2.client import PSTN2Client

app = FastAPI()
client = PSTN2Client(...)

@app.post('/api/calls/verify')
async def verify_call(
    caller_id: str,
    called_id: str,
    call_reference: str,
):
    try:
        verification = await client.auth.verify_call(
            caller_id=caller_id,
            called_id=called_id,
            call_reference=call_reference,
        )
        return {'success': True, 'verification': verification}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event('shutdown')
async def shutdown():
    await client.close()
```

### Django Integration

```python
# In your Django app
from pstn2.client import PSTN2Client
from django.conf import settings

client = PSTN2Client(
    cp_id=settings.PSTN2_CP_ID,
    api_endpoint=settings.PSTN2_API_ENDPOINT,
    private_key=settings.PSTN2_PRIVATE_KEY,
    auth_mode=settings.PSTN2_AUTH_MODE,
)

# In your view
async def verify_call_view(request):
    verification = await client.auth.verify_call(...)
    return JsonResponse({'verified': verification.verified})
```

## Testing

### Unit Tests with pytest

```python
import pytest
from pstn2.client import PSTN2Client, AuthenticationMode

@pytest.fixture
async def client():
    client = PSTN2Client(
        cp_id='TEST-CP-001',
        api_endpoint='https://test.example.com',
        private_key='test-key',
        auth_mode=AuthenticationMode.DIRECT_QUERY,
    )
    yield client
    await client.close()

@pytest.mark.asyncio
async def test_verify_call(client):
    result = await client.auth.verify_call(
        caller_id='+441234567890',
        called_id='+447700900123',
        call_reference='test-123',
    )
    assert result.verified is True
```

## Performance Tips

1. **Reuse Client Instances**: Create one client and reuse it across requests
2. **Connection Pooling**: httpx automatically pools connections
3. **Async All the Way**: Use async/await throughout your application
4. **Cache Directory Results**: Store CP lookups with TTL

## Examples

See the `examples/` directory for complete working examples:

- `01_basic_authentication.py` - Basic authentication flow
- `02_direct_routing.py` - Direct routing with media negotiation
- `03_token_pool.py` - Token Pool authentication
- `04_emergency_services.py` - Emergency location services
- `05_complete_call_flow.py` - End-to-end call scenario

See [EXAMPLES.md](../EXAMPLES.md) for detailed documentation.

## Further Reading

- [SPECIFICATION.md](../../docs/SPECIFICATION.md) - PSTN2 protocol specification
- [API-SPECIFICATION.yaml](../../docs/API-SPECIFICATION.yaml) - REST API documentation
- [IMPLEMENTATION-GUIDE.md](../../docs/IMPLEMENTATION-GUIDE.md) - Implementation patterns

## License

See main project LICENSE file.
