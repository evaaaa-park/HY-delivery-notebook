// Save a file from the app. iPhone/iPad home-screen apps handle the share sheet better than downloads.
export async function saveFile(name, blob) {
  const file = new File([blob], name, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true }
    catch (e) { if (e?.name === 'AbortError') return false }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return true
}
