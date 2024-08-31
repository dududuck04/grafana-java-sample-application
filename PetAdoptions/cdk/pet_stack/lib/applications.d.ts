import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
export declare class Applications extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps);
    private createSsmParameters;
    private createOuputs;
}
