/**
 * A refusal no retry can change — thrown by the upload pipelines for what
 * they check themselves (a clip over the length cap, a file over the server's
 * source cap, a type it would refuse). Its message is for the author, like any
 * other; `canRetryUpload` (retryable.ts) offers no Retry for it.
 *
 * Its own module so the services that throw it need not import the retry
 * rules, which import them.
 */
export class UploadRefusal extends Error {
    constructor(message: string) {
        super(message)
        // Keeps `instanceof` honest if a build ever downlevels classes.
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = "UploadRefusal"
    }
}
