src/
│
app/
    │
    ├── layout.tsx         → global layout
    ├── page.tsx           → home (feed)
    │
    ├── login/
    │   └── page.tsx
    │
    ├── profile/
    │   └── [id]/
    │       └── page.tsx
    │
    ├── post/
    │   └── [id]/
    │       └── page.tsx
    │

├── core/
│   ├── api/
│   ├── auth/
│
├── features/
│   ├── auth/
│   ├── feed/
│   ├── post/
│   ├── comment/
│   ├── follow/
│   ├── profile/
│
├── shared/
│   ├── components/
│   │   └── ui/
│   ├── hooks/
│   ├── utils/
│   ├── types/
│
├── store/
│
├── styles/
│   └── global.css


app = routes
features = functionality
shared = reusable UI
core = system logic



video upload 

Frontend
   ↓
Upload (S3 - raw video)
   ↓
Processing (compression + transcoding)
   ↓
Store processed versions
   ↓
Serve via CDN (CloudFront)