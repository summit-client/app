import { NextRequest, NextResponse } from 'next/server'

interface GoalSuggestion {
  title: string
  description: string
  targetDays: number
  reason: string
}

function buildFallbackSuggestions(clientName: string, context: string): GoalSuggestion[] {
  const profile = context.trim() || 'recent behavior and task outcomes'

  return [
    {
      title: `Increase on-task time for ${clientName}`,
      description:
        `Increase sustained on-task participation by using short reinforcement intervals and clear transition prompts. Focus on ${profile}.`,
      targetDays: 14,
      reason: 'Short two-week window supports rapid review and adjustment.',
    },
    {
      title: `Reduce high-frequency behavior episodes for ${clientName}`,
      description:
        'Use antecedent supports, planned breaks, and differential reinforcement to reduce target behavior frequency during structured activities.',
      targetDays: 21,
      reason: 'Three-week period provides enough data points for trend validation.',
    },
    {
      title: `Increase independent task completions for ${clientName}`,
      description:
        'Target a higher percentage of independent completions by fading prompts in small steps and reinforcing independent responses immediately.',
      targetDays: 30,
      reason: 'One-month window allows gradual prompt fading with measurable checkpoints.',
    },
  ]
}

function tryParseSuggestions(text: string): GoalSuggestion[] | null {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null

    const cleaned = parsed
      .map(item => ({
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        description: typeof item?.description === 'string' ? item.description.trim() : '',
        targetDays: Number(item?.targetDays),
        reason: typeof item?.reason === 'string' ? item.reason.trim() : '',
      }))
      .filter(item => item.title && item.description && Number.isFinite(item.targetDays) && item.targetDays > 0)

    return cleaned.length ? cleaned : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { clientName?: string; context?: string }
    const clientName = (body.clientName ?? 'Client').trim() || 'Client'
    const context = (body.context ?? '').trim()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        source: 'fallback',
        suggestions: buildFallbackSuggestions(clientName, context),
      })
    }

    const prompt = [
      'You are an ABA clinician assistant generating SMART goals.',
      `Client: ${clientName}`,
      `Context: ${context || 'No additional context provided.'}`,
      'Generate exactly 3 goal suggestions as a JSON array.',
      'Each object must include: title, description, targetDays (integer), reason.',
      'Keep descriptions practical and measurable for clinician progress tracking.',
      'Return ONLY valid JSON with no markdown.',
    ].join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const fallback = buildFallbackSuggestions(clientName, context)
      return NextResponse.json({ source: 'fallback', suggestions: fallback })
    }

    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
    }

    const contentText =
      json.content
        ?.filter(item => item.type === 'text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('\n') ?? ''

    const parsed = tryParseSuggestions(contentText)
    const suggestions = parsed ?? buildFallbackSuggestions(clientName, context)

    return NextResponse.json({
      source: parsed ? 'claude' : 'fallback',
      suggestions,
    })
  } catch {
    return NextResponse.json(
      {
        source: 'fallback',
        suggestions: buildFallbackSuggestions('Client', ''),
      },
      { status: 200 }
    )
  }
}
