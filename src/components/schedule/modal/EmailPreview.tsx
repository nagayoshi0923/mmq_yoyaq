interface EmailPreviewProps {
  emailBody: string
}

export function EmailPreview({ emailBody }: EmailPreviewProps) {
  return (
    <div className="border rounded-lg p-4 bg-white max-h-[400px] overflow-y-auto">
      <pre className="font-mono text-xs text-gray-800 whitespace-pre-wrap break-words">
        {emailBody}
      </pre>
    </div>
  )
}

