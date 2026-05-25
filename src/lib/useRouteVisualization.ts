import { useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import type { AppConfig, Provider, QueueStateInfo, ProviderSwitchedPayload } from "@/types"

export interface RouteNode {
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  isActive: boolean
  isExhausted: boolean
}

export interface RouteState {
  port: number
  activeNode: RouteNode | null
  queuedNodes: RouteNode[]
  flashingRed: boolean
  jumpedNodeId: string | null
}

function buildRouteState(
  config: AppConfig | null,
  providers: Provider[],
  queueStates: Record<string, QueueStateInfo>,
  flashingRed: boolean,
  jumpedNodeId: string | null
): RouteState {
  if (!config) {
    return { port: 7860, activeNode: null, queuedNodes: [], flashingRed, jumpedNodeId }
  }

  const defaultQueue = config.queues[config.default_queue_id]
  const state = queueStates[config.default_queue_id]
  const items = defaultQueue?.items ?? []
  const activeIdx = state?.active_idx ?? 0
  const exhaustedIndices = new Set(state?.exhausted_indices ?? [])

  const nodes: RouteNode[] = items.map((item, idx) => {
    const provider = providers.find((p) => p.id === item.provider_id)
    const model = provider?.models.find((m) => m.id === item.model_id)
    return {
      providerId: item.provider_id,
      providerName: provider?.name ?? item.provider_id,
      modelId: item.model_id,
      modelName: model?.name ?? item.model_id,
      isActive: idx === activeIdx,
      isExhausted: exhaustedIndices.has(idx),
    }
  })

  const activeNode = nodes.find((n) => n.isActive) ?? null
  const queuedNodes = nodes.filter((n) => !n.isActive)

  return { port: config.port, activeNode, queuedNodes, flashingRed, jumpedNodeId }
}

export function useRouteVisualization(
  config: AppConfig | null,
  providers: Provider[],
  queueStates: Record<string, QueueStateInfo>
) {
  const [flashingRed, setFlashingRed] = useState(false)
  const [jumpedNodeId, setJumpedNodeId] = useState<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unlisten = listen<ProviderSwitchedPayload>("provider-switched", (event) => {
      // Flash red on old active node
      setFlashingRed(true)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashingRed(false), 200)

      // Jump animation to new active node
      const newProviderId = event.payload.provider_name
      setJumpedNodeId(newProviderId)
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current)
      jumpTimerRef.current = setTimeout(() => setJumpedNodeId(null), 400)
    })

    return () => {
      unlisten.then((fn) => fn())
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current)
    }
  }, [])

  return buildRouteState(config, providers, queueStates, flashingRed, jumpedNodeId)
}
