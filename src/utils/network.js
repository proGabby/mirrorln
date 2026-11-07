/**
 * Network Interface Utility
 * 
 * Inspects host network adapters to resolve available IPv4 LAN addresses.
 * Provides accessible URL endpoints for local and cross-device testing.
 */

const os = require('node:os');

class NetworkUtility {
  /**
   * Retrieves all non-internal IPv4 network interfaces on the host.
   * @returns {string[]} Array of IPv4 addresses.
   */
  static getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      const networkCards = interfaces[name];
      if (!networkCards) continue;

      for (const card of networkCards) {
        if (card.family === 'IPv4' && !card.internal) {
          addresses.push(card.address);
        }
      }
    }

    return addresses;
  }

  /**
   * Generates display URLs for console output and client hints.
   * @param {number} port 
   * @returns {{ local: string, network: string[] }}
   */
  static getAccessUrls(port) {
    const ips = NetworkUtility.getLocalIpAddresses();
    return {
      local: `http://localhost:${port}`,
      network: ips.map(ip => `http://${ip}:${port}`)
    };
  }
}

module.exports = NetworkUtility;

