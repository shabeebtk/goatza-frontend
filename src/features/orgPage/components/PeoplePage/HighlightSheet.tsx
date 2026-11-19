"use client"

import { useId, useState } from "react"

import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useUpdatePlayer } from "../../hooks/usePeople"
import { pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import type { FeaturedPlayer } from "../../types"
import { PageTextField } from "../PageFields/PageFields"
import PageSheet from "../PageSheet/PageSheet"
import styles from "./PeoplePage.module.css"

export const HIGHLIGHT_MAX = 60

/** One line under a picked player ("State U19 squad"); empty takes it off. */
export default function HighlightSheet({
  orgId,
  player,
  onClose,
}: {
  orgId: string
  player: FeaturedPlayer
  onClose: () => void
}) {
  const ids = useId()
  const toast = useToast()
  const update = useUpdatePlayer(orgId)
  const [value, setValue] = useState(player.highlight ?? "")
  const [error, setError] = useState("")
  const formId = `${ids}-form`

  const save = (close: () => void) => {
    const highlight = value.trim()
    if (highlight === (player.highlight ?? "").trim()) {
      void settleViewport()
      close()
      return
    }
    update.mutate(
      { featuredId: player.id, highlight },
      {
        onSuccess: () => {
          toast.show({ title: "Highlight saved", variant: "success", position: "top-center" })
          void settleViewport()
          close()
        },
        onError: (err) => {
          const fieldError = pageFieldErrors(err).highlight
          if (fieldError) setError(fieldError)
          else
            toast.show({
              title: "Couldn't save",
              message: pageErrorSentence(err),
              variant: "error",
              position: "top-center",
            })
        },
      }
    )
  }

  return (
    <PageSheet
      title="Highlight"
      onClose={onClose}
      footer={() => (
        <Button variant="brand" fullWidth type="submit" form={formId} loading={update.isPending}>
          Save
        </Button>
      )}
    >
      {(close) => (
        <form
          id={formId}
          className={styles.sheetForm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            save(close)
          }}
        >
          <PageTextField
            id={`${ids}-highlight`}
            label={`What ${player.user.name} achieved`}
            placeholder="State U19 squad"
            maxLength={HIGHLIGHT_MAX}
            autoComplete="off"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError("")
            }}
            error={error}
            hint="Shows under their name. Leave it empty for none."
            aside={
              <span className={styles.counter}>
                {value.length} / {HIGHLIGHT_MAX}
              </span>
            }
          />
        </form>
      )}
    </PageSheet>
  )
}
