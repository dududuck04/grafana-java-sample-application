import { Construct } from "constructs";
import { CfnRole } from "aws-cdk-lib/aws-iam";
export interface Cloud9EnvironmentProps {
    name?: string;
    vpcId: string;
    subnetId: string;
    templateFile: string;
    cloud9OwnerArn?: string;
}
export declare class Cloud9Environment extends Construct {
    readonly c9Role: CfnRole;
    constructor(scope: Construct, id: string, props: Cloud9EnvironmentProps);
}
