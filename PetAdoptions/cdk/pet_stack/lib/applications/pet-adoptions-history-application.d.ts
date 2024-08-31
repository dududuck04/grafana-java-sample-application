import { EksApplication, EksApplicationProps } from './eks-application';
import { Construct } from 'constructs';
export interface PetAdoptionsHistoryProps extends EksApplicationProps {
    rdsSecretArn: string;
    targetGroupArn: string;
    otelConfigMapPath: string;
}
export declare class PetAdoptionsHistory extends EksApplication {
    constructor(scope: Construct, id: string, props: PetAdoptionsHistoryProps);
}
