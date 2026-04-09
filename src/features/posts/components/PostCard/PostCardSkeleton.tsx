import styles from "./PostCardSkeleton.module.css"

export default function PostSkeleton() {
    return (
        <div className={styles.skeleton}>
            <div className={styles.skeletonHeader}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
                <div className={styles.skeletonLines}>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLineSm}`} />
                </div>
            </div>
            <div className={`${styles.skeletonBlock} ${styles.skeletonContent}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonMedia}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonActions}`} />
        </div>
    )
}