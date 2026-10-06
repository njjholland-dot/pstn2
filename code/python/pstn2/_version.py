"""Version constants shared by every module."""

__version__ = "1.1.0"

#: Protocol version spoken by this SDK (SPECIFICATION.md v1.1).
PROTOCOL_VERSION = "1.1"

#: Sent on every request (SPECIFICATION.md §4.2). Hosting WAFs such as pstn2.org's
#: reject generic library user agents, so this is always set explicitly.
USER_AGENT = f"pstn2-python-sdk/{__version__}"
