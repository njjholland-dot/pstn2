# PSTN2 Go SDK

High-performance Go implementation of the PSTN2 distributed telecommunications protocol.

> **Status: reference API — not yet published.** The Go SDK
> (`github.com/pstn2/pstn2-go/pkg/...`) has not been published and its
> `pkg/` sources are not included in this repository yet, so
> `go get github.com/pstn2/pstn2-go` will not work and the examples will
> not compile. The `examples/` directories and the snippets below
> illustrate the *intended* SDK surface. A `go.mod` is provided so the
> module layout is ready for when the SDK lands.

## Installation

Once the SDK is published, installation will be:

```bash
go get github.com/pstn2/pstn2-go
```

## Requirements

- Go 1.21 or later
- Dependencies managed with Go modules

## Quick Start

```go
package main

import (
    "context"
    "fmt"
    "os"

    "github.com/pstn2/pstn2-go/pkg/client"
    "github.com/pstn2/pstn2-go/pkg/types"
)

func main() {
    ctx := context.Background()

    pstn2Client, err := client.NewClient(&client.Config{
        CPID:        "CP1-UK-0001",
        APIEndpoint: "https://api.yourcp.com/pstn2/v1",
        PrivateKey:  os.Getenv("PSTN2_PRIVATE_KEY"),
        AuthMode:    types.AuthModeDirectQuery,
    })
    if err != nil {
        panic(err)
    }
    defer pstn2Client.Close()

    // Verify an inbound call
    verification, err := pstn2Client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{
        CallerID:      "+441234567890",
        CalledID:      "+447700900123",
        CallReference: "abc-123-def-456",
    })
    if err != nil {
        panic(err)
    }

    fmt.Printf("Call verified: %t\n", verification.Verified)
}
```

## Features

- ✅ **High Performance**: Concurrent processing with goroutines
- ✅ **Type Safety**: Full type definitions throughout
- ✅ **Authentication**: Both Direct Query and Token Pool modes
- ✅ **Direct Routing**: Peer-to-peer routing discovery
- ✅ **End-to-End Encryption**: Ed25519 key exchange
- ✅ **Call Branding**: Verified caller information display
- ✅ **Emergency Services**: Real-time GPS location (PSAP)
- ✅ **Directory Service**: Distributed number lookups
- ✅ **Context Support**: Full context.Context integration
- ✅ **Production Ready**: Connection pooling, retries, timeouts

## Project Setup

### Initialize Module

```bash
# Create new module
mkdir my-pstn2-app
cd my-pstn2-app
go mod init my-pstn2-app

# Add PSTN2 dependency
go get github.com/pstn2/pstn2-go
```

### Project Structure

```
my-pstn2-app/
├── main.go
├── go.mod
└── go.sum
```

## Running Examples

1. Set environment variables:
```bash
export PSTN2_PRIVATE_KEY="your-private-key-here"
export CP1_PRIVATE_KEY="your-cp1-key-here"
export PSAP_PRIVATE_KEY="your-psap-key-here"
export TOKEN_POOL_JWT="your-jwt-token-here"
```

2. Run an example (each example is its own `main` package; note that these
   will only compile once the SDK `pkg/` sources are published):
```bash
go run ./examples/01-basic-authentication
go run ./examples/02-direct-routing
go run ./examples/03-token-pool
go run ./examples/04-emergency-services
go run ./examples/05-complete-call-flow
```

## SDK API Reference

### Client Configuration

```go
import (
    "github.com/pstn2/pstn2-go/pkg/client"
    "github.com/pstn2/pstn2-go/pkg/types"
)

pstn2Client, err := client.NewClient(&client.Config{
    CPID:        "CP1-UK-0001",
    APIEndpoint: "https://api.yourcp.com/pstn2/v1",
    PrivateKey:  os.Getenv("PSTN2_PRIVATE_KEY"),
    AuthMode:    types.AuthModeDirectQuery,
    Timeout:     2 * time.Second,
    Retries:     3,
    LogLevel:    "info",
})
if err != nil {
    return err
}
defer pstn2Client.Close()
```

### Authentication Module

```go
// Verify call (Direct Query)
verification, err := pstn2Client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{
    CallerID:      "+441234567890",
    CalledID:      "+447700900123",
    CallReference: "abc-123-def-456",
})
if err != nil {
    return err
}

// Create token (Token Pool)
token, err := pstn2Client.Auth().CreateToken(ctx, &types.CreateTokenRequest{
    CallerID:      "+441234567890",
    CalledID:      "+447700900123",
    CallReference: "token-call-123",
    TTL:           30, // seconds
})
if err != nil {
    return err
}

// Verify token
verification, err := pstn2Client.Auth().VerifyToken(ctx, token.TokenID)
```

### Routing Module

```go
routing, err := pstn2Client.Routing().RequestRouting(ctx, &types.RoutingRequest{
    DestinationNumber: "+447700900123",
    CallerID:          "+441234567890",
    CallReference:     "xyz-789-abc-012",
    MediaCapabilities: &types.MediaCapabilities{
        Codecs:       []string{"opus", "g722", "pcmu"},
        Encryption:   []string{"srtp-aes256", "srtp-aes128"},
        Video:        false,
        MaxBandwidth: 128000,
    },
    Branding: &types.CallBranding{
        DisplayName:     "ACME Support",
        Logo:            "https://cdn.acme.com/logo.png",
        BackgroundColor: "#0066cc",
        CallPurpose:     "Account Security Alert",
    },
})
if err != nil {
    return err
}
```

### Directory Module

```go
// Lookup number
cpInfo, err := pstn2Client.Directory().Lookup(ctx, "+441234567890")
if err != nil {
    return err
}
fmt.Printf("Hosted by: %s\n", cpInfo.CPID)

// Reverse lookup
ranges, err := pstn2Client.Directory().Reverse(ctx, "CP1-UK-0001")
```

### Emergency Module

```go
// Get caller location (PSAP only)
location, err := pstn2Client.Emergency().GetLocation(ctx, &types.LocationRequest{
    CallerID:      "+441234567890",
    CallReference: "emergency-456-789",
    PSAPID:        "UK-999-LONDON-CENTRAL",
})
if err != nil {
    return err
}

fmt.Printf("GPS: %.6f, %.6f\n", location.Location.Latitude, location.Location.Longitude)
fmt.Printf("Accuracy: %.1fm\n", location.Location.Accuracy)
```

## Error Handling

```go
import "github.com/pstn2/pstn2-go/pkg/errors"

verification, err := pstn2Client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{...})
if err != nil {
    switch {
    case errors.IsAuthenticationError(err):
        fmt.Printf("Authentication failed: %v\n", err)
    case errors.IsNetworkError(err):
        fmt.Printf("Network error: %v\n", err)
    case errors.IsTimeout(err):
        fmt.Printf("Request timeout: %v\n", err)
    default:
        fmt.Printf("Error: %v\n", err)
    }
    return err
}
```

## Best Practices

### 1. Use Context

```go
// ✅ Good - pass context for cancellation and timeouts
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

verification, err := client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{...})
```

### 2. Always Close Clients

```go
pstn2Client, err := client.NewClient(&client.Config{...})
if err != nil {
    return err
}
defer pstn2Client.Close()
```

### 3. Use Environment Variables

```go
// ✅ Good
privateKey := os.Getenv("PSTN2_PRIVATE_KEY")

// ❌ Bad
privateKey := "hardcoded-key"
```

### 4. Handle Errors Gracefully

```go
routing, err := pstn2Client.Routing().RequestRouting(ctx, &types.RoutingRequest{...})
if err != nil {
    log.Printf("PSTN2 routing failed: %v, falling back to PSTN", err)
    return fallbackToPSTN(...)
}

if !routing.Accepted {
    log.Printf("Routing rejected: %s", routing.Reason)
    return fallbackToPSTN(...)
}

// Use PSTN2 routing
return connectDirectly(routing.ConnectionDetails)
```

## Integration Examples

### HTTP Server Integration

```go
package main

import (
    "context"
    "encoding/json"
    "net/http"
    "os"
    "time"

    "github.com/pstn2/pstn2-go/pkg/client"
    "github.com/pstn2/pstn2-go/pkg/types"
)

var pstn2Client *client.Client

func main() {
    var err error
    pstn2Client, err = client.NewClient(&client.Config{
        CPID:        os.Getenv("PSTN2_CP_ID"),
        APIEndpoint: os.Getenv("PSTN2_API_ENDPOINT"),
        PrivateKey:  os.Getenv("PSTN2_PRIVATE_KEY"),
        AuthMode:    types.AuthModeDirectQuery,
    })
    if err != nil {
        panic(err)
    }
    defer pstn2Client.Close()

    http.HandleFunc("/api/calls/verify", verifyCallHandler)
    http.ListenAndServe(":8080", nil)
}

func verifyCallHandler(w http.ResponseWriter, r *http.Request) {
    var req types.VerifyCallRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    verification, err := pstn2Client.Auth().VerifyCall(ctx, &req)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(verification)
}
```

### gRPC Service Integration

```go
type callService struct {
    pstn2Client *client.Client
}

func (s *callService) VerifyCall(ctx context.Context, req *pb.VerifyCallRequest) (*pb.VerifyCallResponse, error) {
    verification, err := s.pstn2Client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{
        CallerID:      req.CallerId,
        CalledID:      req.CalledId,
        CallReference: req.CallReference,
    })
    if err != nil {
        return nil, err
    }

    return &pb.VerifyCallResponse{
        Verified:   verification.Verified,
        CallerName: verification.CallerName,
        TrustLevel: string(verification.TrustLevel),
    }, nil
}
```

## Testing

### Unit Tests

```go
package main

import (
    "context"
    "testing"

    "github.com/pstn2/pstn2-go/pkg/client"
    "github.com/pstn2/pstn2-go/pkg/types"
)

func TestVerifyCall(t *testing.T) {
    ctx := context.Background()

    pstn2Client, err := client.NewClient(&client.Config{
        CPID:        "TEST-CP-001",
        APIEndpoint: "https://test.example.com",
        PrivateKey:  "test-key",
        AuthMode:    types.AuthModeDirectQuery,
    })
    if err != nil {
        t.Fatal(err)
    }
    defer pstn2Client.Close()

    verification, err := pstn2Client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{
        CallerID:      "+441234567890",
        CalledID:      "+447700900123",
        CallReference: "test-123",
    })
    if err != nil {
        t.Fatal(err)
    }

    if !verification.Verified {
        t.Error("Expected call to be verified")
    }
}
```

### Benchmark Tests

```go
func BenchmarkVerifyCall(b *testing.B) {
    ctx := context.Background()
    pstn2Client, _ := client.NewClient(&client.Config{...})
    defer pstn2Client.Close()

    req := &types.VerifyCallRequest{
        CallerID:      "+441234567890",
        CalledID:      "+447700900123",
        CallReference: "bench-test",
    }

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, err := pstn2Client.Auth().VerifyCall(ctx, req)
        if err != nil {
            b.Fatal(err)
        }
    }
}
```

## Performance Tips

1. **Reuse Client Instances**: Create one client instance and reuse it
2. **Use Connection Pooling**: The SDK automatically pools HTTP connections
3. **Leverage Goroutines**: Make concurrent calls when appropriate
4. **Set Appropriate Timeouts**: Use context timeouts for better control
5. **Cache Directory Results**: Store CP lookups with TTL

## Examples

See the `examples/` directory for complete examples of the intended SDK surface:

- `01-basic-authentication/` - Basic authentication flow
- `02-direct-routing/` - Direct routing with media negotiation
- `03-token-pool/` - Token Pool authentication
- `04-emergency-services/` - Emergency location services
- `05-complete-call-flow/` - End-to-end call scenario

See [EXAMPLES.md](../EXAMPLES.md) for detailed documentation.

## Further Reading

- [SPECIFICATION.md](../../docs/SPECIFICATION.md) - PSTN2 protocol specification
- [API-SPECIFICATION.yaml](../../docs/API-SPECIFICATION.yaml) - REST API documentation
- [IMPLEMENTATION-GUIDE.md](../../docs/IMPLEMENTATION-GUIDE.md) - Implementation patterns

## License

See main project LICENSE file.
