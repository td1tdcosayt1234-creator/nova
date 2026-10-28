/* ============ Nova Bridge — shared constants (main + stdio proxy) ============ */

const DEFAULT_PORT = 8748

const NOVA_VERSION = '0.2.0'

/* MCP protocol versions this bridge accepts (negotiate with client) */
const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2024-11-05']

module.exports = { DEFAULT_PORT, NOVA_VERSION, MCP_PROTOCOL_VERSIONS }
