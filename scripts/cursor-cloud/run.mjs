#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { Agent, CursorAgentError } from '@cursor/sdk'

const LOG_PREFIX = '[cursor-cloud]'

function fail(message, code = 1) {
  console.error(`${LOG_PREFIX} ${message}`)
  process.exit(code)
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    fail(`required env ${name} is missing`, 1)
  }
  return value
}

function optionalEnv(name) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : ''
}

function boolEnv(name, defaultValue) {
  const value = process.env[name]
  if (value == null || value.trim() === '') return defaultValue
  return /^(1|true|yes|on)$/i.test(value.trim())
}

function firstPrUrl(git) {
  const branches = git?.branches
  if (!Array.isArray(branches)) return null
  for (const branch of branches) {
    if (branch?.prUrl) return branch.prUrl
  }
  return null
}

function firstBranch(git) {
  const branches = git?.branches
  if (!Array.isArray(branches)) return null
  for (const branch of branches) {
    if (branch?.branch) return branch.branch
  }
  return null
}

function writeResult(resultFile, payload) {
  try {
    writeFileSync(resultFile, JSON.stringify(payload, null, 2))
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to write result file: ${error?.message || error}`)
  }
}

async function main() {
  const apiKey = requireEnv('CURSOR_API_KEY')
  const promptFile = requireEnv('CURSOR_PROMPT_FILE')
  const resultFile = requireEnv('CURSOR_RESULT_FILE')
  const repoUrl = requireEnv('CURSOR_REPO_URL')

  const startingRef = optionalEnv('CURSOR_STARTING_REF')
  const prUrl = optionalEnv('CURSOR_PR_URL')
  const autoCreatePR = boolEnv('CURSOR_AUTO_CREATE_PR', false)
  const workOnCurrentBranch = boolEnv('CURSOR_WORK_ON_CURRENT_BRANCH', false)
  const skipReviewerRequest = boolEnv('CURSOR_SKIP_REVIEWER_REQUEST', true)
  const mode = optionalEnv('CURSOR_MODE') || 'agent'
  const modelId = optionalEnv('CURSOR_MODEL') || 'auto'
  const agentName = optionalEnv('CURSOR_AGENT_NAME')
  const idempotencyKey = optionalEnv('CURSOR_IDEMPOTENCY_KEY')

  if (mode !== 'agent' && mode !== 'plan') {
    fail(`CURSOR_MODE must be "agent" or "plan" (got "${mode}")`, 1)
  }
  if (startingRef && prUrl) {
    fail('CURSOR_STARTING_REF and CURSOR_PR_URL are mutually exclusive; set only one', 1)
  }

  let promptText
  try {
    promptText = readFileSync(promptFile, 'utf8')
  } catch (error) {
    fail(`failed to read prompt file ${promptFile}: ${error?.message || error}`, 1)
  }
  if (!promptText || !promptText.trim()) {
    fail(`prompt file ${promptFile} is empty`, 1)
  }

  const repo = { url: repoUrl }
  if (prUrl) {
    repo.prUrl = prUrl
  } else if (startingRef) {
    repo.startingRef = startingRef
  }

  const options = {
    apiKey,
    model: { id: modelId },
    mode,
    cloud: {
      repos: [repo],
      autoCreatePR,
      workOnCurrentBranch,
      skipReviewerRequest,
    },
  }
  if (agentName) options.name = agentName
  if (idempotencyKey) options.idempotencyKey = idempotencyKey

  console.log(
    `${LOG_PREFIX} launching cloud agent repo=${repoUrl} ref=${prUrl ? `pr(${prUrl})` : startingRef || 'default'} ` +
      `mode=${mode} model=${modelId} autoCreatePR=${autoCreatePR} workOnCurrentBranch=${workOnCurrentBranch}`,
  )

  let result
  try {
    result = await Agent.prompt(promptText, options)
  } catch (error) {
    if (error instanceof CursorAgentError) {
      writeResult(resultFile, {
        id: null,
        requestId: error?.requestId ?? null,
        status: 'startup_error',
        result: null,
        error: {
          message: error?.message ?? String(error),
          code: error?.code ?? null,
          isRetryable: error?.isRetryable ?? null,
        },
        model: null,
        durationMs: null,
        usage: null,
        git: null,
      })
      fail(`startup failed (agent did not run): ${error?.message} retryable=${error?.isRetryable}`, 1)
    }
    writeResult(resultFile, {
      id: null,
      requestId: null,
      status: 'exception',
      result: null,
      error: { message: error?.message ?? String(error), code: null, isRetryable: null },
      model: null,
      durationMs: null,
      usage: null,
      git: null,
    })
    fail(`unexpected error: ${error?.message ?? error}`, 1)
  }

  const payload = {
    id: result?.id ?? null,
    requestId: result?.requestId ?? null,
    status: result?.status ?? null,
    result: result?.result ?? null,
    error: result?.error ?? null,
    model: result?.model ?? null,
    durationMs: result?.durationMs ?? null,
    usage: result?.usage ?? null,
    git: result?.git ?? null,
  }
  writeResult(resultFile, payload)

  const pr = firstPrUrl(result?.git)
  const branch = firstBranch(result?.git)
  console.log(
    `${LOG_PREFIX} run id=${payload.id ?? 'unknown'} requestId=${payload.requestId ?? 'unknown'} status=${payload.status ?? 'unknown'}`,
  )
  if (pr) console.log(`${LOG_PREFIX} pr=${pr}`)
  else if (branch) console.log(`${LOG_PREFIX} branch=${branch} (no PR URL)`)

  if (payload.status !== 'finished') {
    fail(`run did not finish (status=${payload.status})`, 2)
  }
  console.log(`${LOG_PREFIX} run finished`)
}

main().catch((error) => {
  fail(`fatal: ${error?.message ?? error}`, 1)
})
