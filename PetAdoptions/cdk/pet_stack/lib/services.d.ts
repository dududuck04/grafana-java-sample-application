import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import 'ts-replace-all';
export declare class Services extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps);
    private createSsmParameters;
    private createOuputs;
}
