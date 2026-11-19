"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { MAX_PROGRAMS, useDeleteProgram, usePrograms, useReorderPrograms } from "../../hooks/usePrograms"
import { moveId } from "../../hooks/reorder"
import { pageErrorSentence } from "../../pageErrors"
import { orgAdminBase, pageBase } from "../../sectionMeta"
import type { Program } from "../../types"
import ActionsSheet from "../ActionsSheet/ActionsSheet"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import ProgramCard from "../ProgramCard/ProgramCard"
import ReorderButtons from "../ReorderButtons/ReorderButtons"
import RequirePagePermission from "../RequirePagePermission/RequirePagePermission"
import styles from "./ProgramsPage.module.css"

const TITLE = "Programs & fees"

export default function ProgramsPage({ orgId }: { orgId: string }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.PAGE_MANAGE}>
      <ProgramsList orgId={orgId} />
    </RequirePagePermission>
  )
}

function ProgramsList({ orgId }: { orgId: string }) {
  const toast = useToast()
  const { data: programs, isLoading, isError, refetch, isRefetching } = usePrograms(orgId)
  const { data: org } = useOrgDetail(orgId)
  const reorder = useReorderPrograms(orgId)
  const remove = useDeleteProgram(orgId)
  const [menuFor, setMenuFor] = useState<Program | null>(null)
  const [deleting, setDeleting] = useState<Program | null>(null)

  const list = programs ?? []
  const noSport = Boolean(org) && (org?.sports?.length ?? 0) === 0
  const atLimit = list.length >= MAX_PROGRAMS
  const canAdd = !noSport && !atLimit
  const newHref = `${pageBase(orgId)}/programs/new`

  const move = (program: Program, delta: -1 | 1) => {
    const ids = moveId(
      list.map((item) => item.id),
      program.id,
      delta
    )
    if (ids) reorder.mutate(ids)
  }

  const addButton = canAdd ? (
    <Button variant="brand" href={newHref} leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}>
      Add
    </Button>
  ) : (
    <Button variant="brand" disabled leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}>
      Add
    </Button>
  )

  return (
    <PageEditorLayout orgId={orgId} title={TITLE} action={addButton}>
      {noSport && (
        <div className={styles.notice} role="status">
          <Icon icon="mdi:information-outline" width={20} height={20} aria-hidden="true" />
          <p>
            Add a sport to your page first.{" "}
            <Link href={`${orgAdminBase(orgId)}/profile?edit=profile`} className={styles.noticeLink}>
              Add a sport
            </Link>
          </p>
        </div>
      )}
      {atLimit && <p className={styles.limit}>You can add up to {MAX_PROGRAMS} programs.</p>}

      {isLoading ? (
        <div className={styles.skeleton} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.skeletonCard} />
          ))}
        </div>
      ) : isError && !programs ? (
        <div className={styles.state} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
          <p>Couldn&apos;t load your programs.</p>
          <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Icon icon="mdi:clipboard-list-outline" width={28} height={28} />
          </span>
          <p>Add your first program: name, ages, days and fee.</p>
          {canAdd ? (
            <Button variant="brand" href={newHref} leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}>
              Add a program
            </Button>
          ) : (
            <Button variant="brand" disabled>
              Add a program
            </Button>
          )}
        </div>
      ) : (
        <ul className={styles.list}>
          {list.map((program, index) => (
            <li key={program.id}>
              <ProgramCard
                program={program}
                actions={
                  <>
                    <Button
                      variant="outline"
                      href={`${pageBase(orgId)}/programs/${program.id}`}
                      leftIcon={<Icon icon="mdi:pencil-outline" width={18} height={18} />}
                    >
                      Edit
                    </Button>
                    <span className={styles.spacer} />
                    <ReorderButtons
                      name={program.name}
                      isFirst={index === 0}
                      isLast={index === list.length - 1}
                      disabled={reorder.isPending}
                      onMove={(delta) => move(program, delta)}
                    />
                    <button
                      type="button"
                      className={styles.more}
                      aria-label={`More for ${program.name}`}
                      onClick={() => setMenuFor(program)}
                    >
                      <Icon icon="mdi:dots-horizontal" width={22} height={22} aria-hidden="true" />
                    </button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      {menuFor && (
        <ActionsSheet
          title={menuFor.name}
          onClose={() => setMenuFor(null)}
          actions={[
            {
              id: "delete",
              label: "Delete program",
              icon: "mdi:trash-can-outline",
              tone: "danger",
              onSelect: () => setDeleting(menuFor),
            },
          ]}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this program?"
        message="Enquiries that named it keep its name."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={() => {
          const program = deleting
          setDeleting(null)
          if (!program) return
          remove.mutate(program.id, {
            onSuccess: () =>
              toast.show({ title: "Program deleted", variant: "success", position: "top-center" }),
            onError: (err) =>
              toast.show({
                title: "Couldn't delete it",
                message: pageErrorSentence(err),
                variant: "error",
                position: "top-center",
              }),
          })
        }}
        onCancel={() => setDeleting(null)}
      />
    </PageEditorLayout>
  )
}
