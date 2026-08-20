type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[]
}

function serialize(data: JsonLdProps['data']): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  )
}
