import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
export interface StatusUpdaterServiceProps {
    tableName: string;
}
export declare class StatusUpdaterService extends Construct {
    api: apigw.RestApi;
    constructor(scope: Construct, id: string, props: StatusUpdaterServiceProps);
}
