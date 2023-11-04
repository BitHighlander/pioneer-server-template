/*

    Pioneer REST endpoints



 */
let TAG = ' | API | '

const pjson = require('../../package.json');
const log = require('@pioneer-platform/loggerdog')()
const {redis} = require('@pioneer-platform/default-redis')
const os = require("os")
//rest-ts
import { Controller, Get, Route, Tags } from 'tsoa';

import {
    Error,
    ApiError,
    Chart,
} from "@pioneer-platform/pioneer-types";

//route
@Tags('Status Endpoints')
@Route('')
export class IndexController extends Controller {

    //remove api key


    /**
     *  Health Endpoint
     *  Gives me the health of the system
     *
     */

    @Get('/health')
    public async health() {
        let tag = TAG + " | health | "
        try{

            let queueStatus:any = await redis.hgetall("info:pioneer")

            let output:any = {
                online:true,
                hostname:os.hostname(),
                uptime:os.uptime(),
                loadavg:os.loadavg(),
                name:pjson.name,
                version:pjson.version,
                system:queueStatus
            }

            return(output)
        }catch(e){
            let errorResp:any = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }

    @Get('/plugin')
    public async plugin() {
        let tag = TAG + " | plugin | "
        try{

            let output:any = {
                "schema_version": "v1",
                "name_for_model": "Pioneer",
                "name_for_human": "Pioneer Api",
                "description_for_human": "Explore the world of cryptocurrency. live blockchain information and data.",
                "description_for_model": "pioneer api that give real time blockchain information, lets users register wallets and then query information about their wallets with the pioneer api. ",
                "api": {
                    "type": "openapi",
                    "url": "https://pioneers.dev/spec/swagger.json",
                    "has_user_authentication": false
                },
                "auth": {
                    "type": "none"
                },
                "logo_url": "https://pioneers.dev/coins/pioneer.png",
                "contact_email": "highlander@keepkey.com",
                "legal_info_url": "pioneers.dev"
            }

            return(output)
        }catch(e){
            let errorResp:any = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }

}
