// Shared logging helper — writes to system_logs table
// Usage: await writeLog(supabase, 'contact', 'error', 'Insert failed', { detail: err.message })

export async function writeLog(supabase, functionName, level, message, meta = {}) {
  try {
    await supabase.from('system_logs').insert({
      function_name: functionName,
      level,           // 'error' | 'warn' | 'info'
      message,
      meta: Object.keys(meta).length ? meta : null,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    // Never let logging crash the function
    console.error('writeLog failed:', e.message)
  }
}
