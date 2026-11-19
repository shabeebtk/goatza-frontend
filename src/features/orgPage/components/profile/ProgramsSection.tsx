"use client"

import { useId, useState } from "react"
import { Icon } from "@iconify/react"

import { useEnquiry } from "@/features/enquiries/EnquiryContext"
import Button from "@/shared/components/ui/Button/Button"
import { countLabel } from "../../format"
import type { Program } from "../../types"
import ProgramCard from "../ProgramCard/ProgramCard"
import ProfileSection, { ShowAllButton } from "./ProfileSection"
import styles from "./ProgramsSection.module.css"

/** Cards shown before "See all". */
const PREVIEW = 3

/**
 * Programs & fees: the first three cards, then "See all N programs", which opens
 * the rest in place. With the enquiry form on, each card asks for an enquiry
 * about itself ("Join the waitlist" once it is full).
 */
export default function ProgramsSection({
  programs,
  enquiryForm,
}: {
  programs: Program[]
  enquiryForm: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const enquiry = useEnquiry()
  const listId = useId()

  if (programs.length === 0) return null
  const shown = expanded ? programs : programs.slice(0, PREVIEW)

  return (
    <ProfileSection
      sectionKey="programs"
      title="Programs & fees"
      meta={countLabel(programs.length, "program", "programs")}
    >
      <ul id={listId} className={styles.list}>
        {shown.map((program) => {
          const full = program.spots === "full"
          return (
            <li key={program.id}>
              <ProgramCard
                program={program}
                actions={
                  enquiryForm ? (
                    <Button
                      variant={full ? "outline" : "brand"}
                      fullWidth
                      aria-label={`${full ? "Join the waitlist for" : "Enquire about"} ${program.name}`}
                      leftIcon={
                        <Icon
                          icon={full ? "mdi:clock-outline" : "mdi:message-text-outline"}
                          width={18}
                          height={18}
                        />
                      }
                      onClick={() => enquiry.open({ programId: program.id })}
                    >
                      {full ? "Join the waitlist" : "Enquire"}
                    </Button>
                  ) : undefined
                }
              />
            </li>
          )
        })}
      </ul>

      {programs.length > PREVIEW && (
        <ShowAllButton
          expanded={expanded}
          total={programs.length}
          noun="programs"
          controls={listId}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </ProfileSection>
  )
}
