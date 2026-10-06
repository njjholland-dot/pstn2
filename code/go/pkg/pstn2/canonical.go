package pstn2

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"unicode/utf8"
)

// CanonicalJSON returns the canonical JSON form used for signatures (§9.6):
// object keys sorted lexicographically at every level, no insignificant
// whitespace, "/" not escaped, non-ASCII characters left unescaped. Strings
// and numbers are written exactly as JavaScript's JSON.stringify writes them,
// so Go, TypeScript and Python produce identical bytes.
//
// v may be any value encoding/json can marshal (structs, maps, json.RawMessage,
// []byte of JSON is NOT special-cased — pass json.RawMessage for raw JSON).
func CanonicalJSON(v any) ([]byte, error) {
	var generic any
	switch x := v.(type) {
	case json.RawMessage:
		if err := json.Unmarshal(x, &generic); err != nil {
			return nil, err
		}
	default:
		raw, err := json.Marshal(v)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &generic); err != nil {
			return nil, err
		}
	}
	var buf bytes.Buffer
	if err := writeCanonical(&buf, generic); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeCanonical(buf *bytes.Buffer, v any) error {
	switch x := v.(type) {
	case nil:
		buf.WriteString("null")
	case bool:
		if x {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case float64:
		// encoding/json formats float64 like ECMAScript Number.prototype.toString.
		b, err := json.Marshal(x)
		if err != nil {
			return err
		}
		buf.Write(b)
	case string:
		writeJSString(buf, x)
	case []any:
		buf.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeCanonical(buf, e); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool { return jsLess(keys[i], keys[j]) })
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			writeJSString(buf, k)
			buf.WriteByte(':')
			if err := writeCanonical(buf, x[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	default:
		return fmt.Errorf("pstn2: canonical JSON: unsupported type %T", v)
	}
	return nil
}

// jsLess orders strings by UTF-16 code units, as JavaScript's Array.sort does.
func jsLess(a, b string) bool {
	ua, ub := utf16Units(a), utf16Units(b)
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			return ua[i] < ub[i]
		}
	}
	return len(ua) < len(ub)
}

func utf16Units(s string) []uint16 {
	out := make([]uint16, 0, len(s))
	for _, r := range s {
		if r >= 0x10000 {
			r -= 0x10000
			out = append(out, uint16(0xD800+(r>>10)), uint16(0xDC00+(r&0x3FF)))
		} else {
			out = append(out, uint16(r))
		}
	}
	return out
}

// writeJSString writes s the way JSON.stringify does: only ", \ and control
// characters are escaped; "/", "<", ">", "&", U+2028/U+2029 and all other
// non-ASCII characters are written as-is.
func writeJSString(buf *bytes.Buffer, s string) {
	buf.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch {
		case r == '"':
			buf.WriteString(`\"`)
		case r == '\\':
			buf.WriteString(`\\`)
		case r == '\b':
			buf.WriteString(`\b`)
		case r == '\f':
			buf.WriteString(`\f`)
		case r == '\n':
			buf.WriteString(`\n`)
		case r == '\r':
			buf.WriteString(`\r`)
		case r == '\t':
			buf.WriteString(`\t`)
		case r < 0x20:
			buf.WriteString(`\u00`)
			h := strconv.FormatInt(int64(r), 16)
			if len(h) < 2 {
				buf.WriteByte('0')
			}
			buf.WriteString(h)
		case r == utf8.RuneError && size == 1:
			buf.WriteString("�")
		default:
			buf.WriteString(s[i : i+size])
		}
		i += size
	}
	buf.WriteByte('"')
}
