# Global NAT Traversal & TURN Server Setup

For WebRTC connections to traverse strict symmetric NATs (common on cellular 4G/5G mobile carriers and corporate firewalls), a TURN (Traversal Using Relays around NAT) server is used as a fallback relay.

## Free Turnkey Options

### Option 1: Metered.ca (Free 50 GB/month)
1. Sign up at [https://www.metered.ca/tools/openrelay/](https://www.metered.ca/tools/openrelay/).
2. Grab your free TURN credentials.
3. Start Mirrorln with environment variables:
   ```bash
   TURN_URL="turn:standard.relay.metered.ca:80" \
   TURN_USERNAME="your-username" \
   TURN_CREDENTIAL="your-password" \
   npm start
   ```

### Option 2: Self-Hosted Coturn (on Ubuntu / Debian)
Install coturn on any inexpensive cloud VPS:
```bash
sudo apt-get update && sudo apt-get install -y coturn
sudo systemctl enable coturn
```
Configure `/etc/turnserver.conf`:
```ini
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=your_strong_secret
realm=your_domain.com
```
