import { StackProps } from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
export declare class PetAdoptionsStepFn extends Construct {
    readonly stepFn: sfn.StateMachine;
    constructor(scope: Construct, id: string, props?: StackProps);
    private createStepFnLambda;
}
