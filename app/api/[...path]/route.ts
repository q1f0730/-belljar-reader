import { env } from 'cloudflare:workers'
import { libraryRequest } from '../../../server/library-agent'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>libraryRequest(request,env)
export const POST=(request:Request)=>libraryRequest(request,env)
