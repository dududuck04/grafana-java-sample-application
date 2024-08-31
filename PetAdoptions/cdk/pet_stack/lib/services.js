"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Services = void 0;
const iam = require("aws-cdk-lib/aws-iam");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const sns = require("aws-cdk-lib/aws-sns");
const sqs = require("aws-cdk-lib/aws-sqs");
const subs = require("aws-cdk-lib/aws-sns-subscriptions");
const ddb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const s3seeder = require("aws-cdk-lib/aws-s3-deployment");
const rds = require("aws-cdk-lib/aws-rds");
const ssm = require("aws-cdk-lib/aws-ssm");
const kms = require("aws-cdk-lib/aws-kms");
const eks = require("aws-cdk-lib/aws-eks");
const yaml = require("js-yaml");
const path = require("path");
const lambda = require("aws-cdk-lib/aws-lambda");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const applicationinsights = require("aws-cdk-lib/aws-applicationinsights");
const resourcegroups = require("aws-cdk-lib/aws-resourcegroups");
const pay_for_adoption_service_1 = require("./services/pay-for-adoption-service");
const list_adoptions_service_1 = require("./services/list-adoptions-service");
const search_service_1 = require("./services/search-service");
const traffic_generator_service_1 = require("./services/traffic-generator-service");
const status_updater_service_1 = require("./services/status-updater-service");
const stepfn_1 = require("./services/stepfn");
const aws_eks_1 = require("aws-cdk-lib/aws-eks");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const fs_1 = require("fs");
require("ts-replace-all");
const aws_cloudwatch_1 = require("aws-cdk-lib/aws-cloudwatch");
const lambda_layer_kubectl_1 = require("aws-cdk-lib/lambda-layer-kubectl");
const cloud9_1 = require("./modules/core/cloud9");
class Services extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        super(scope, id, props);
        var isEventEngine = 'false';
        if (this.node.tryGetContext('is_event_engine') != undefined) {
            isEventEngine = this.node.tryGetContext('is_event_engine');
        }
        const stackName = id;
        // Create SQS resource to send Pet adoption messages to
        const sqsQueue = new sqs.Queue(this, 'sqs_petadoption', {
            visibilityTimeout: aws_cdk_lib_1.Duration.seconds(300)
        });
        // Create SNS and an email topic to send notifications to
        const topic_petadoption = new sns.Topic(this, 'topic_petadoption');
        var topic_email = this.node.tryGetContext('snstopic_email');
        if (topic_email == undefined) {
            topic_email = "someone@example.com";
        }
        topic_petadoption.addSubscription(new subs.EmailSubscription(topic_email));
        // Creates an S3 bucket to store pet images
        const s3_observabilitypetadoptions = new s3.Bucket(this, 's3bucket_petadoption', {
            publicReadAccess: false,
            autoDeleteObjects: true,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        // Creates the DynamoDB table for Petadoption data
        const dynamodb_petadoption = new ddb.Table(this, 'ddb_petadoption', {
            partitionKey: {
                name: 'pettype',
                type: ddb.AttributeType.STRING
            },
            sortKey: {
                name: 'petid',
                type: ddb.AttributeType.STRING
            },
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        dynamodb_petadoption.metric('WriteThrottleEvents', { statistic: "avg" }).createAlarm(this, 'WriteThrottleEvents-BasicAlarm', {
            threshold: 0,
            treatMissingData: aws_cloudwatch_1.TreatMissingData.NOT_BREACHING,
            comparisonOperator: aws_cloudwatch_1.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 1,
            alarmName: `${dynamodb_petadoption.tableName}-WriteThrottleEvents-BasicAlarm`,
        });
        dynamodb_petadoption.metric('ReadThrottleEvents', { statistic: "avg" }).createAlarm(this, 'ReadThrottleEvents-BasicAlarm', {
            threshold: 0,
            treatMissingData: aws_cloudwatch_1.TreatMissingData.NOT_BREACHING,
            comparisonOperator: aws_cloudwatch_1.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 1,
            alarmName: `${dynamodb_petadoption.tableName}-ReadThrottleEvents-BasicAlarm`,
        });
        // Seeds the S3 bucket with pet images
        new s3seeder.BucketDeployment(this, "s3seeder_petadoption", {
            destinationBucket: s3_observabilitypetadoptions,
            sources: [s3seeder.Source.asset('./resources/kitten.zip'), s3seeder.Source.asset('./resources/puppies.zip'), s3seeder.Source.asset('./resources/bunnies.zip')]
        });
        var cidrRange = this.node.tryGetContext('vpc_cidr');
        if (cidrRange == undefined) {
            cidrRange = "11.0.0.0/16";
        }
        // The VPC where all the microservices will be deployed into
        const theVPC = new ec2.Vpc(this, 'Microservices', {
            ipAddresses: ec2.IpAddresses.cidr(cidrRange),
            // cidr: cidrRange,
            natGateways: 1,
            maxAzs: 2
        });
        // Create RDS Aurora PG cluster
        const rdssecuritygroup = new ec2.SecurityGroup(this, 'petadoptionsrdsSG', {
            vpc: theVPC
        });
        rdssecuritygroup.addIngressRule(ec2.Peer.ipv4(theVPC.vpcCidrBlock), ec2.Port.tcp(5432), 'Allow Aurora PG access from within the VPC CIDR range');
        var rdsUsername = this.node.tryGetContext('rdsusername');
        if (rdsUsername == undefined) {
            rdsUsername = "petadmin";
        }
        const auroraCluster = new rds.ServerlessCluster(this, 'Database', {
            engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_13_9 }),
            parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql13'),
            vpc: theVPC,
            securityGroups: [rdssecuritygroup],
            defaultDatabaseName: 'adoptions',
            scaling: {
                autoPause: aws_cdk_lib_1.Duration.minutes(60),
                minCapacity: rds.AuroraCapacityUnit.ACU_2,
                maxCapacity: rds.AuroraCapacityUnit.ACU_8,
            }
        });
        const readSSMParamsPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ssm:GetParametersByPath',
                'ssm:GetParameters',
                'ssm:GetParameter',
                'ec2:DescribeVpcs'
            ],
            resources: ['*']
        });
        const ddbSeedPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:BatchWriteItem',
                'dynamodb:ListTables',
                "dynamodb:Scan",
                "dynamodb:Query"
            ],
            resources: ['*']
        });
        const repositoryURI = "public.ecr.aws/one-observability-workshop";
        const stack = aws_cdk_lib_1.Stack.of(this);
        const region = stack.region;
        const ecsServicesSecurityGroup = new ec2.SecurityGroup(this, 'ECSServicesSG', {
            vpc: theVPC
        });
        ecsServicesSecurityGroup.addIngressRule(ec2.Peer.ipv4(theVPC.vpcCidrBlock), ec2.Port.tcp(80));
        const ecsPayForAdoptionCluster = new ecs.Cluster(this, "PayForAdoption", {
            vpc: theVPC,
            containerInsights: true
        });
        // PayForAdoption service definitions-----------------------------------------------------------------------
        const payForAdoptionService = new pay_for_adoption_service_1.PayForAdoptionService(this, 'pay-for-adoption-service', {
            cluster: ecsPayForAdoptionCluster,
            logGroupName: "/ecs/PayForAdoption",
            cpu: 1024,
            memoryLimitMiB: 2048,
            healthCheck: '/health/status',
            // build locally
            //repositoryURI: repositoryURI,
            database: auroraCluster,
            desiredTaskCount: 2,
            region: region,
            securityGroup: ecsServicesSecurityGroup
        });
        (_a = payForAdoptionService.taskDefinition.taskRole) === null || _a === void 0 ? void 0 : _a.addToPrincipalPolicy(readSSMParamsPolicy);
        (_b = payForAdoptionService.taskDefinition.taskRole) === null || _b === void 0 ? void 0 : _b.addToPrincipalPolicy(ddbSeedPolicy);
        const ecsPetListAdoptionCluster = new ecs.Cluster(this, "PetListAdoptions", {
            vpc: theVPC,
            containerInsights: true
        });
        // PetListAdoptions service definitions-----------------------------------------------------------------------
        const listAdoptionsService = new list_adoptions_service_1.ListAdoptionsService(this, 'list-adoptions-service', {
            cluster: ecsPetListAdoptionCluster,
            logGroupName: "/ecs/PetListAdoptions",
            cpu: 1024,
            memoryLimitMiB: 2048,
            healthCheck: '/health/status',
            instrumentation: 'otel',
            // build locally
            //repositoryURI: repositoryURI,
            database: auroraCluster,
            desiredTaskCount: 2,
            region: region,
            securityGroup: ecsServicesSecurityGroup
        });
        (_c = listAdoptionsService.taskDefinition.taskRole) === null || _c === void 0 ? void 0 : _c.addToPrincipalPolicy(readSSMParamsPolicy);
        const ecsPetSearchCluster = new ecs.Cluster(this, "PetSearch", {
            vpc: theVPC,
            containerInsights: true
        });
        // PetSearch service definitions-----------------------------------------------------------------------
        const searchService = new search_service_1.SearchService(this, 'search-service', {
            cluster: ecsPetSearchCluster,
            logGroupName: "/ecs/PetSearch",
            cpu: 1024,
            memoryLimitMiB: 2048,
            //repositoryURI: repositoryURI,
            healthCheck: '/health/status',
            desiredTaskCount: 2,
            instrumentation: 'otel',
            region: region,
            securityGroup: ecsServicesSecurityGroup
        });
        (_d = searchService.taskDefinition.taskRole) === null || _d === void 0 ? void 0 : _d.addToPrincipalPolicy(readSSMParamsPolicy);
        // Traffic Generator task definition.
        const trafficGeneratorService = new traffic_generator_service_1.TrafficGeneratorService(this, 'traffic-generator-service', {
            cluster: ecsPetListAdoptionCluster,
            logGroupName: "/ecs/PetTrafficGenerator",
            cpu: 256,
            memoryLimitMiB: 512,
            instrumentation: 'none',
            //repositoryURI: repositoryURI,
            desiredTaskCount: 1,
            region: region,
            securityGroup: ecsServicesSecurityGroup
        });
        (_e = trafficGeneratorService.taskDefinition.taskRole) === null || _e === void 0 ? void 0 : _e.addToPrincipalPolicy(readSSMParamsPolicy);
        //PetStatusUpdater Lambda Function and APIGW--------------------------------------
        const statusUpdaterService = new status_updater_service_1.StatusUpdaterService(this, 'status-updater-service', {
            tableName: dynamodb_petadoption.tableName
        });
        const albSG = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
            vpc: theVPC,
            securityGroupName: 'ALBSecurityGroup',
            allowAllOutbound: true
        });
        albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
        // PetSite - Create ALB and Target Groups
        const alb = new elbv2.ApplicationLoadBalancer(this, 'PetSiteLoadBalancer', {
            vpc: theVPC,
            internetFacing: true,
            securityGroup: albSG
        });
        trafficGeneratorService.node.addDependency(alb);
        const targetGroup = new elbv2.ApplicationTargetGroup(this, 'PetSiteTargetGroup', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            vpc: theVPC,
            targetType: elbv2.TargetType.IP
        });
        new ssm.StringParameter(this, "putParamTargetGroupArn", {
            stringValue: targetGroup.targetGroupArn,
            parameterName: '/eks/petsite/TargetGroupArn'
        });
        const listener = alb.addListener('Listener', {
            port: 80,
            open: true,
            defaultTargetGroups: [targetGroup],
        });
        // PetAdoptionHistory - attach service to path /petadoptionhistory on PetSite ALB
        const petadoptionshistory_targetGroup = new elbv2.ApplicationTargetGroup(this, 'PetAdoptionsHistoryTargetGroup', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            vpc: theVPC,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health/status',
            }
        });
        listener.addTargetGroups('PetAdoptionsHistoryTargetGroups', {
            priority: 10,
            conditions: [
                elbv2.ListenerCondition.pathPatterns(['/petadoptionshistory/*']),
            ],
            targetGroups: [petadoptionshistory_targetGroup]
        });
        new ssm.StringParameter(this, "putPetHistoryParamTargetGroupArn", {
            stringValue: petadoptionshistory_targetGroup.targetGroupArn,
            parameterName: '/eks/pethistory/TargetGroupArn'
        });
        // PetSite - EKS Cluster
        const clusterAdmin = new iam.Role(this, 'AdminRole', {
            assumedBy: new iam.AccountRootPrincipal()
        });
        new ssm.StringParameter(this, "putParam", {
            stringValue: clusterAdmin.roleArn,
            parameterName: '/eks/petsite/EKSMasterRoleArn'
        });
        const secretsKey = new kms.Key(this, 'SecretsKey');
        const cluster = new eks.Cluster(this, 'petsite', {
            clusterName: 'PetSite',
            mastersRole: clusterAdmin,
            vpc: theVPC,
            defaultCapacity: 2,
            defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
            secretsEncryptionKey: secretsKey,
            version: aws_eks_1.KubernetesVersion.of('1.27'),
            kubectlLayer: new lambda_layer_kubectl_1.KubectlLayer(this, 'kubectl')
        });
        const clusterSG = ec2.SecurityGroup.fromSecurityGroupId(this, 'ClusterSG', cluster.clusterSecurityGroupId);
        clusterSG.addIngressRule(albSG, ec2.Port.allTraffic(), 'Allow traffic from the ALB');
        clusterSG.addIngressRule(ec2.Peer.ipv4(theVPC.vpcCidrBlock), ec2.Port.tcp(443), 'Allow local access to k8s api');
        // Add SSM Permissions to the node role
        (_f = cluster.defaultNodegroup) === null || _f === void 0 ? void 0 : _f.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
        // From https://github.com/aws-samples/ssm-agent-daemonset-installer
        var ssmAgentSetup = yaml.loadAll((0, fs_1.readFileSync)("./resources/setup-ssm-agent.yaml", "utf8"));
        const ssmAgentSetupManifest = new eks.KubernetesManifest(this, "ssmAgentdeployment", {
            cluster: cluster,
            manifest: ssmAgentSetup
        });
        // ClusterID is not available for creating the proper conditions https://github.com/aws/aws-cdk/issues/10347
        const clusterId = aws_cdk_lib_1.Fn.select(4, aws_cdk_lib_1.Fn.split('/', cluster.clusterOpenIdConnectIssuerUrl)); // Remove https:// from the URL as workaround to get ClusterID
        const cw_federatedPrincipal = new iam.FederatedPrincipal(cluster.openIdConnectProvider.openIdConnectProviderArn, {
            StringEquals: new aws_cdk_lib_1.CfnJson(this, "CW_FederatedPrincipalCondition", {
                value: {
                    [`oidc.eks.${region}.amazonaws.com/id/${clusterId}:aud`]: "sts.amazonaws.com"
                }
            })
        });
        const cw_trustRelationship = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [cw_federatedPrincipal],
            actions: ["sts:AssumeRoleWithWebIdentity"]
        });
        // Create IAM roles for Service Accounts
        // Cloudwatch Agent SA
        const cwserviceaccount = new iam.Role(this, 'CWServiceAccount', {
            //                assumedBy: eksFederatedPrincipal,
            assumedBy: new iam.AccountRootPrincipal(),
            managedPolicies: [
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'CWServiceAccount-CloudWatchAgentServerPolicy', 'arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy')
            ],
        });
        (_g = cwserviceaccount.assumeRolePolicy) === null || _g === void 0 ? void 0 : _g.addStatements(cw_trustRelationship);
        const xray_federatedPrincipal = new iam.FederatedPrincipal(cluster.openIdConnectProvider.openIdConnectProviderArn, {
            StringEquals: new aws_cdk_lib_1.CfnJson(this, "Xray_FederatedPrincipalCondition", {
                value: {
                    [`oidc.eks.${region}.amazonaws.com/id/${clusterId}:aud`]: "sts.amazonaws.com"
                }
            })
        });
        const xray_trustRelationship = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [xray_federatedPrincipal],
            actions: ["sts:AssumeRoleWithWebIdentity"]
        });
        // X-Ray Agent SA
        const xrayserviceaccount = new iam.Role(this, 'XRayServiceAccount', {
            //                assumedBy: eksFederatedPrincipal,
            assumedBy: new iam.AccountRootPrincipal(),
            managedPolicies: [
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'XRayServiceAccount-AWSXRayDaemonWriteAccess', 'arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess')
            ],
        });
        (_h = xrayserviceaccount.assumeRolePolicy) === null || _h === void 0 ? void 0 : _h.addStatements(xray_trustRelationship);
        const loadbalancer_federatedPrincipal = new iam.FederatedPrincipal(cluster.openIdConnectProvider.openIdConnectProviderArn, {
            StringEquals: new aws_cdk_lib_1.CfnJson(this, "LB_FederatedPrincipalCondition", {
                value: {
                    [`oidc.eks.${region}.amazonaws.com/id/${clusterId}:aud`]: "sts.amazonaws.com"
                }
            })
        });
        const loadBalancer_trustRelationship = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [loadbalancer_federatedPrincipal],
            actions: ["sts:AssumeRoleWithWebIdentity"]
        });
        const loadBalancerPolicyDoc = iam.PolicyDocument.fromJson(JSON.parse((0, fs_1.readFileSync)("./resources/load_balancer/iam_policy.json", "utf8")));
        const loadBalancerPolicy = new iam.ManagedPolicy(this, 'LoadBalancerSAPolicy', { document: loadBalancerPolicyDoc });
        const loadBalancerserviceaccount = new iam.Role(this, 'LoadBalancerServiceAccount', {
            //                assumedBy: eksFederatedPrincipal,
            assumedBy: new iam.AccountRootPrincipal(),
            managedPolicies: [loadBalancerPolicy]
        });
        (_j = loadBalancerserviceaccount.assumeRolePolicy) === null || _j === void 0 ? void 0 : _j.addStatements(loadBalancer_trustRelationship);
        // Fix for EKS Dashboard access
        const dashboardRoleYaml = yaml.loadAll((0, fs_1.readFileSync)("./resources/dashboard.yaml", "utf8"));
        const dashboardRoleArn = this.node.tryGetContext('dashboard_role_arn');
        if ((dashboardRoleArn != undefined) && (dashboardRoleArn.length > 0)) {
            const role = iam.Role.fromRoleArn(this, "DashboardRoleArn", dashboardRoleArn, { mutable: false });
            cluster.awsAuth.addRoleMapping(role, { groups: ["dashboard-view"] });
        }
        if (isEventEngine === 'true') {
            var c9Env = new cloud9_1.Cloud9Environment(this, 'Cloud9Environment', {
                vpcId: theVPC.vpcId,
                subnetId: theVPC.publicSubnets[0].subnetId,
                cloud9OwnerArn: "assumed-role/WSParticipantRole/Participant",
                templateFile: __dirname + "/../../../../cloud9-cfn.yaml"
            });
            var c9role = c9Env.c9Role;
            // Dynamically check if AWSCloud9SSMAccessRole and AWSCloud9SSMInstanceProfile exists
            const c9SSMRole = new iam.Role(this, 'AWSCloud9SSMAccessRole', {
                path: '/service-role/',
                roleName: 'AWSCloud9SSMAccessRole',
                assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal("ec2.amazonaws.com"), new iam.ServicePrincipal("cloud9.amazonaws.com")),
                managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCloud9SSMInstanceProfile"), iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")]
            });
            const teamRole = iam.Role.fromRoleArn(this, 'TeamRole', "arn:aws:iam::" + stack.account + ":role/WSParticipantRole");
            cluster.awsAuth.addRoleMapping(teamRole, { groups: ["dashboard-view"] });
            if (c9role != undefined) {
                cluster.awsAuth.addMastersRole(iam.Role.fromRoleArn(this, 'c9role', c9role.attrArn, { mutable: false }));
            }
        }
        const eksAdminArn = this.node.tryGetContext('admin_role');
        if ((eksAdminArn != undefined) && (eksAdminArn.length > 0)) {
            const role = iam.Role.fromRoleArn(this, "ekdAdminRoleArn", eksAdminArn, { mutable: false });
            cluster.awsAuth.addMastersRole(role);
        }
        const dahshboardManifest = new eks.KubernetesManifest(this, "k8sdashboardrbac", {
            cluster: cluster,
            manifest: dashboardRoleYaml
        });
        var xRayYaml = yaml.loadAll((0, fs_1.readFileSync)("./resources/k8s_petsite/xray-daemon-config.yaml", "utf8"));
        xRayYaml[0].metadata.annotations["eks.amazonaws.com/role-arn"] = new aws_cdk_lib_1.CfnJson(this, "xray_Role", { value: `${xrayserviceaccount.roleArn}` });
        const xrayManifest = new eks.KubernetesManifest(this, "xraydeployment", {
            cluster: cluster,
            manifest: xRayYaml
        });
        var loadBalancerServiceAccountYaml = yaml.loadAll((0, fs_1.readFileSync)("./resources/load_balancer/service_account.yaml", "utf8"));
        loadBalancerServiceAccountYaml[0].metadata.annotations["eks.amazonaws.com/role-arn"] = new aws_cdk_lib_1.CfnJson(this, "loadBalancer_Role", { value: `${loadBalancerserviceaccount.roleArn}` });
        const loadBalancerServiceAccount = new eks.KubernetesManifest(this, "loadBalancerServiceAccount", {
            cluster: cluster,
            manifest: loadBalancerServiceAccountYaml
        });
        const waitForLBServiceAccount = new eks.KubernetesObjectValue(this, 'LBServiceAccount', {
            cluster: cluster,
            objectName: "alb-ingress-controller",
            objectType: "serviceaccount",
            objectNamespace: "kube-system",
            jsonPath: "@"
        });
        const loadBalancerCRDYaml = yaml.loadAll((0, fs_1.readFileSync)("./resources/load_balancer/crds.yaml", "utf8"));
        const loadBalancerCRDManifest = new eks.KubernetesManifest(this, "loadBalancerCRD", {
            cluster: cluster,
            manifest: loadBalancerCRDYaml
        });
        const awsLoadBalancerManifest = new eks.HelmChart(this, "AWSLoadBalancerController", {
            cluster: cluster,
            chart: "aws-load-balancer-controller",
            repository: "https://aws.github.io/eks-charts",
            namespace: "kube-system",
            values: {
                clusterName: "PetSite",
                serviceAccount: {
                    create: false,
                    name: "alb-ingress-controller"
                },
                wait: true
            }
        });
        awsLoadBalancerManifest.node.addDependency(loadBalancerCRDManifest);
        awsLoadBalancerManifest.node.addDependency(loadBalancerServiceAccount);
        awsLoadBalancerManifest.node.addDependency(waitForLBServiceAccount);
        // NOTE: Amazon CloudWatch Observability Addon for CloudWatch Agent and Fluentbit
        const otelAddon = new eks.CfnAddon(this, 'otelObservabilityAddon', {
            addonName: 'amazon-cloudwatch-observability',
            clusterName: cluster.clusterName,
            // the properties below are optional
            resolveConflicts: 'OVERWRITE',
            preserveOnDelete: false,
            serviceAccountRoleArn: cwserviceaccount.roleArn,
        });
        const customWidgetResourceControllerPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ecs:ListServices',
                'ecs:UpdateService',
                'eks:DescribeNodegroup',
                'eks:ListNodegroups',
                'eks:DescribeUpdate',
                'eks:UpdateNodegroupConfig',
                'ecs:DescribeServices',
                'eks:DescribeCluster',
                'eks:ListClusters',
                'ecs:ListClusters'
            ],
            resources: ['*']
        });
        var customWidgetLambdaRole = new iam.Role(this, 'customWidgetLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        customWidgetLambdaRole.addToPrincipalPolicy(customWidgetResourceControllerPolicy);
        var petsiteApplicationResourceController = new lambda.Function(this, 'petsite-application-resource-controler', {
            code: lambda.Code.fromAsset(path.join(__dirname, '/../resources/resource-controller-widget')),
            handler: 'petsite-application-resource-controler.lambda_handler',
            memorySize: 128,
            runtime: lambda.Runtime.PYTHON_3_9,
            role: customWidgetLambdaRole,
            timeout: aws_cdk_lib_1.Duration.minutes(10)
        });
        petsiteApplicationResourceController.addEnvironment("EKS_CLUSTER_NAME", cluster.clusterName);
        petsiteApplicationResourceController.addEnvironment("ECS_CLUSTER_ARNS", ecsPayForAdoptionCluster.clusterArn + "," +
            ecsPetListAdoptionCluster.clusterArn + "," + ecsPetSearchCluster.clusterArn);
        var customWidgetFunction = new lambda.Function(this, 'cloudwatch-custom-widget', {
            code: lambda.Code.fromAsset(path.join(__dirname, '/../resources/resource-controller-widget')),
            handler: 'cloudwatch-custom-widget.lambda_handler',
            memorySize: 128,
            runtime: lambda.Runtime.PYTHON_3_9,
            role: customWidgetLambdaRole,
            timeout: aws_cdk_lib_1.Duration.seconds(60)
        });
        customWidgetFunction.addEnvironment("CONTROLER_LAMBDA_ARN", petsiteApplicationResourceController.functionArn);
        customWidgetFunction.addEnvironment("EKS_CLUSTER_NAME", cluster.clusterName);
        customWidgetFunction.addEnvironment("ECS_CLUSTER_ARNS", ecsPayForAdoptionCluster.clusterArn + "," +
            ecsPetListAdoptionCluster.clusterArn + "," + ecsPetSearchCluster.clusterArn);
        var costControlDashboardBody = (0, fs_1.readFileSync)("./resources/cw_dashboard_cost_control.json", "utf-8");
        costControlDashboardBody = costControlDashboardBody.replaceAll("{{YOUR_LAMBDA_ARN}}", customWidgetFunction.functionArn);
        const petSiteCostControlDashboard = new cloudwatch.CfnDashboard(this, "PetSiteCostControlDashboard", {
            dashboardName: "PetSite_Cost_Control_Dashboard",
            dashboardBody: costControlDashboardBody
        });
        // Creating AWS Resource Group for all the resources of stack.
        const servicesCfnGroup = new resourcegroups.CfnGroup(this, 'ServicesCfnGroup', {
            name: stackName,
            description: 'Contains all the resources deployed by Cloudformation Stack ' + stackName,
            resourceQuery: {
                type: 'CLOUDFORMATION_STACK_1_0',
            }
        });
        // Enabling CloudWatch Application Insights for Resource Group
        const servicesCfnApplication = new applicationinsights.CfnApplication(this, 'ServicesApplicationInsights', {
            resourceGroupName: servicesCfnGroup.name,
            autoConfigurationEnabled: true,
            cweMonitorEnabled: true,
            opsCenterEnabled: true,
        });
        // Adding dependency to create these resources at last
        servicesCfnGroup.node.addDependency(petSiteCostControlDashboard);
        servicesCfnApplication.node.addDependency(servicesCfnGroup);
        // Adding a Lambda function to produce the errors - manually executed
        var dynamodbQueryLambdaRole = new iam.Role(this, 'dynamodbQueryLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'manageddynamodbread', 'arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess'),
                iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambdaBasicExecRoletoddb', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
            ]
        });
        var dynamodbQueryFunction = new lambda.Function(this, 'dynamodb-query-function', {
            code: lambda.Code.fromAsset(path.join(__dirname, '/../resources/application-insights')),
            handler: 'dynamodb-query-function.lambda_handler',
            memorySize: 128,
            runtime: lambda.Runtime.PYTHON_3_9,
            role: dynamodbQueryLambdaRole,
            timeout: aws_cdk_lib_1.Duration.seconds(900)
        });
        dynamodbQueryFunction.addEnvironment("DYNAMODB_TABLE_NAME", dynamodb_petadoption.tableName);
        this.createOuputs(new Map(Object.entries({
            'CWServiceAccountArn': cwserviceaccount.roleArn,
            'XRayServiceAccountArn': xrayserviceaccount.roleArn,
            'OIDCProviderUrl': cluster.clusterOpenIdConnectIssuerUrl,
            'OIDCProviderArn': cluster.openIdConnectProvider.openIdConnectProviderArn,
            'PetSiteUrl': `http://${alb.loadBalancerDnsName}`,
            'DynamoDBQueryFunction': dynamodbQueryFunction.functionName
        })));
        const petAdoptionsStepFn = new stepfn_1.PetAdoptionsStepFn(this, 'StepFn');
        this.createSsmParameters(new Map(Object.entries({
            '/petstore/trafficdelaytime': "1",
            '/petstore/rumscript': " ",
            '/petstore/petadoptionsstepfnarn': petAdoptionsStepFn.stepFn.stateMachineArn,
            '/petstore/updateadoptionstatusurl': statusUpdaterService.api.url,
            '/petstore/queueurl': sqsQueue.queueUrl,
            '/petstore/snsarn': topic_petadoption.topicArn,
            '/petstore/dynamodbtablename': dynamodb_petadoption.tableName,
            '/petstore/s3bucketname': s3_observabilitypetadoptions.bucketName,
            '/petstore/searchapiurl': `http://${searchService.service.loadBalancer.loadBalancerDnsName}/api/search?`,
            '/petstore/searchimage': searchService.container.imageName,
            '/petstore/petlistadoptionsurl': `http://${listAdoptionsService.service.loadBalancer.loadBalancerDnsName}/api/adoptionlist/`,
            '/petstore/petlistadoptionsmetricsurl': `http://${listAdoptionsService.service.loadBalancer.loadBalancerDnsName}/metrics`,
            '/petstore/paymentapiurl': `http://${payForAdoptionService.service.loadBalancer.loadBalancerDnsName}/api/home/completeadoption`,
            '/petstore/payforadoptionmetricsurl': `http://${payForAdoptionService.service.loadBalancer.loadBalancerDnsName}/metrics`,
            '/petstore/cleanupadoptionsurl': `http://${payForAdoptionService.service.loadBalancer.loadBalancerDnsName}/api/home/cleanupadoptions`,
            '/petstore/petsearch-collector-manual-config': (0, fs_1.readFileSync)("./resources/collector/ecs-xray-manual.yaml", "utf8"),
            '/petstore/rdssecretarn': `${(_k = auroraCluster.secret) === null || _k === void 0 ? void 0 : _k.secretArn}`,
            '/petstore/rdsendpoint': auroraCluster.clusterEndpoint.hostname,
            '/petstore/stackname': stackName,
            '/petstore/petsiteurl': `http://${alb.loadBalancerDnsName}`,
            '/petstore/pethistoryurl': `http://${alb.loadBalancerDnsName}/petadoptionshistory`,
            '/eks/petsite/OIDCProviderUrl': cluster.clusterOpenIdConnectIssuerUrl,
            '/eks/petsite/OIDCProviderArn': cluster.openIdConnectProvider.openIdConnectProviderArn,
            '/petstore/errormode1': "false"
        })));
        this.createOuputs(new Map(Object.entries({
            'QueueURL': sqsQueue.queueUrl,
            'UpdateAdoptionStatusurl': statusUpdaterService.api.url,
            'SNSTopicARN': topic_petadoption.topicArn,
            'RDSServerName': auroraCluster.clusterEndpoint.hostname
        })));
    }
    createSsmParameters(params) {
        params.forEach((value, key) => {
            //const id = key.replace('/', '_');
            new ssm.StringParameter(this, key, { parameterName: key, stringValue: value });
        });
    }
    createOuputs(params) {
        params.forEach((value, key) => {
            new aws_cdk_lib_1.CfnOutput(this, key, { value: value });
        });
    }
}
exports.Services = Services;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywyQ0FBMEM7QUFDMUMsMkNBQTBDO0FBQzFDLDBEQUF5RDtBQUN6RCxnREFBK0M7QUFDL0MseUNBQXdDO0FBQ3hDLDBEQUF5RDtBQUN6RCwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsZ0NBQWdDO0FBQ2hDLDZCQUE2QjtBQUM3QixpREFBaUQ7QUFDakQsZ0VBQWdFO0FBRWhFLHlEQUF5RDtBQUd6RCwyRUFBMkU7QUFDM0UsaUVBQWlFO0FBR2pFLGtGQUEyRTtBQUMzRSw4RUFBd0U7QUFDeEUsOERBQXlEO0FBQ3pELG9GQUE4RTtBQUM5RSw4RUFBd0U7QUFDeEUsOENBQXNEO0FBQ3RELGlEQUF3RDtBQUN4RCw2Q0FBaUc7QUFDakcsMkJBQWtDO0FBQ2xDLDBCQUF1QjtBQUN2QiwrREFBa0Y7QUFDbEYsMkVBQWdFO0FBQ2hFLGtEQUEwRDtBQUUxRCxNQUFhLFFBQVMsU0FBUSxtQkFBSztJQUMvQixZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWtCOztRQUN4RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixJQUFJLGFBQWEsR0FBRyxPQUFPLENBQUM7UUFDNUIsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLFNBQVMsRUFDM0Q7WUFDSSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztTQUM5RDtRQUVELE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUVyQix1REFBdUQ7UUFDdkQsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxD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QUM7UUFFTCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFDckMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxRQUFRO1lBQzdCLHlCQUF5QixFQUFFLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ3ZELGFBQWEsRUFBRSxpQkFBaUIsQ0FBQyxRQUFRO1lBQ3pDLGVBQWUsRUFBRSxhQUFhLENBQUMsZUFBZSxDQUFDLFFBQVE7U0FDMUQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNULENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxNQUEyQjtRQUNuRCxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQzFCLG1DQUFtQztZQUNuQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFLGFBQWEsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDbkYsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sWUFBWSxDQUFDLE1BQTJCO1FBQzVDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUU7WUFDMUIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTtRQUM5QyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQWpxQkQsNEJBaXFCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJ1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnXG5pbXBvcnQgKiBhcyBzdWJzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucydcbmltcG9ydCAqIGFzIGRkYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnXG5pbXBvcnQgKiBhcyBzM3NlZWRlciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudCdcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGVrcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWtzJztcbmltcG9ydCAqIGFzIHlhbWwgZnJvbSAnanMteWFtbCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgY2xvdWQ5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZDknO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcic7XG5pbXBvcnQgKiBhcyBlY3Jhc3NldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjci1hc3NldHMnO1xuaW1wb3J0ICogYXMgYXBwbGljYXRpb25pbnNpZ2h0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25pbnNpZ2h0cyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZWdyb3VwcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmVzb3VyY2Vncm91cHMnO1xuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJ1xuaW1wb3J0IHsgUGF5Rm9yQWRvcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9wYXktZm9yLWFkb3B0aW9uLXNlcnZpY2UnXG5pbXBvcnQgeyBMaXN0QWRvcHRpb25zU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbGlzdC1hZG9wdGlvbnMtc2VydmljZSdcbmltcG9ydCB7IFNlYXJjaFNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL3NlYXJjaC1zZXJ2aWNlJ1xuaW1wb3J0IHsgVHJhZmZpY0dlbmVyYXRvclNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL3RyYWZmaWMtZ2VuZXJhdG9yLXNlcnZpY2UnXG5pbXBvcnQgeyBTdGF0dXNVcGRhdGVyU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvc3RhdHVzLXVwZGF0ZXItc2VydmljZSdcbmltcG9ydCB7IFBldEFkb3B0aW9uc1N0ZXBGbiB9IGZyb20gJy4vc2VydmljZXMvc3RlcGZuJ1xuaW1wb3J0IHsgS3ViZXJuZXRlc1ZlcnNpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWtzJztcbmltcG9ydCB7IENmbkpzb24sIFJlbW92YWxQb2xpY3ksIEZuLCBEdXJhdGlvbiwgU3RhY2ssIFN0YWNrUHJvcHMsIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCAndHMtcmVwbGFjZS1hbGwnXG5pbXBvcnQgeyBUcmVhdE1pc3NpbmdEYXRhLCBDb21wYXJpc29uT3BlcmF0b3IgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgeyBLdWJlY3RsTGF5ZXIgfSBmcm9tICdhd3MtY2RrLWxpYi9sYW1iZGEtbGF5ZXIta3ViZWN0bCc7XG5pbXBvcnQgeyBDbG91ZDlFbnZpcm9ubWVudCB9IGZyb20gJy4vbW9kdWxlcy9jb3JlL2Nsb3VkOSc7XG5cbmV4cG9ydCBjbGFzcyBTZXJ2aWNlcyBleHRlbmRzIFN0YWNrIHtcbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFN0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAgICAgdmFyIGlzRXZlbnRFbmdpbmUgPSAnZmFsc2UnO1xuICAgICAgICBpZiAodGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2lzX2V2ZW50X2VuZ2luZScpICE9IHVuZGVmaW5lZClcbiAgICAgICAge1xuICAgICAgICAgICAgaXNFdmVudEVuZ2luZSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdpc19ldmVudF9lbmdpbmUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN0YWNrTmFtZSA9IGlkO1xuXG4gICAgICAgIC8vIENyZWF0ZSBTUVMgcmVzb3VyY2UgdG8gc2VuZCBQZXQgYWRvcHRpb24gbWVzc2FnZXMgdG9cbiAgICAgICAgY29uc3Qgc3FzUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdzcXNfcGV0YWRvcHRpb24nLCB7XG4gICAgICAgICAgICB2aXNpYmlsaXR5VGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMDApXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENyZWF0ZSBTTlMgYW5kIGFuIGVtYWlsIHRvcGljIHRvIHNlbmQgbm90aWZpY2F0aW9ucyB0b1xuICAgICAgICBjb25zdCB0b3BpY19wZXRhZG9wdGlvbiA9IG5ldyBzbnMuVG9waWModGhpcywgJ3RvcGljX3BldGFkb3B0aW9uJyk7XG4gICAgICAgIHZhciB0b3BpY19lbWFpbCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdzbnN0b3BpY19lbWFpbCcpO1xuICAgICAgICBpZiAodG9waWNfZW1haWwgPT0gdW5kZWZpbmVkKVxuICAgICAgICB7XG4gICAgICAgICAgICB0b3BpY19lbWFpbCA9IFwic29tZW9uZUBleGFtcGxlLmNvbVwiO1xuICAgICAgICB9XG4gICAgICAgIHRvcGljX3BldGFkb3B0aW9uLmFkZFN1YnNjcmlwdGlvbihuZXcgc3Vicy5FbWFpbFN1YnNjcmlwdGlvbih0b3BpY19lbWFpbCkpO1xuXG4gICAgICAgIC8vIENyZWF0ZXMgYW4gUzMgYnVja2V0IHRvIHN0b3JlIHBldCBpbWFnZXNcbiAgICAgICAgY29uc3QgczNfb2JzZXJ2YWJpbGl0eXBldGFkb3B0aW9ucyA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ3MzYnVja2V0X3BldGFkb3B0aW9uJywge1xuICAgICAgICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ3JlYXRlcyB0aGUgRHluYW1vREIgdGFibGUgZm9yIFBldGFkb3B0aW9uIGRhdGFcbiAgICAgICAgY29uc3QgZHluYW1vZGJfcGV0YWRvcHRpb24gPSBuZXcgZGRiLlRhYmxlKHRoaXMsICdkZGJfcGV0YWRvcHRpb24nLCB7XG4gICAgICAgICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncGV0dHlwZScsXG4gICAgICAgICAgICAgICAgdHlwZTogZGRiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc29ydEtleToge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwZXRpZCcsXG4gICAgICAgICAgICAgICAgdHlwZTogZGRiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogIFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgICAgICB9KTtcblxuICAgICAgICBkeW5hbW9kYl9wZXRhZG9wdGlvbi5tZXRyaWMoJ1dyaXRlVGhyb3R0bGVFdmVudHMnLHtzdGF0aXN0aWM6XCJhdmdcIn0pLmNyZWF0ZUFsYXJtKHRoaXMsICdXcml0ZVRocm90dGxlRXZlbnRzLUJhc2ljQWxhcm0nLCB7XG4gICAgICAgICAgdGhyZXNob2xkOiAwLFxuICAgICAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IFRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6IENvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgICAgIGFsYXJtTmFtZTogYCR7ZHluYW1vZGJfcGV0YWRvcHRpb24udGFibGVOYW1lfS1Xcml0ZVRocm90dGxlRXZlbnRzLUJhc2ljQWxhcm1gLFxuICAgICAgICB9KTtcblxuICAgICAgICBkeW5hbW9kYl9wZXRhZG9wdGlvbi5tZXRyaWMoJ1JlYWRUaHJvdHRsZUV2ZW50cycse3N0YXRpc3RpYzpcImF2Z1wifSkuY3JlYXRlQWxhcm0odGhpcywgJ1JlYWRUaHJvdHRsZUV2ZW50cy1CYXNpY0FsYXJtJywge1xuICAgICAgICAgIHRocmVzaG9sZDogMCxcbiAgICAgICAgICB0cmVhdE1pc3NpbmdEYXRhOiBUcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBDb21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgICAgICBhbGFybU5hbWU6IGAke2R5bmFtb2RiX3BldGFkb3B0aW9uLnRhYmxlTmFtZX0tUmVhZFRocm90dGxlRXZlbnRzLUJhc2ljQWxhcm1gLFxuICAgICAgICB9KTtcblxuXG4gICAgICAgIC8vIFNlZWRzIHRoZSBTMyBidWNrZXQgd2l0aCBwZXQgaW1hZ2VzXG4gICAgICAgIG5ldyBzM3NlZWRlci5CdWNrZXREZXBsb3ltZW50KHRoaXMsIFwiczNzZWVkZXJfcGV0YWRvcHRpb25cIiwge1xuICAgICAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHMzX29ic2VydmFiaWxpdHlwZXRhZG9wdGlvbnMsXG4gICAgICAgICAgICBzb3VyY2VzOiBbczNzZWVkZXIuU291cmNlLmFzc2V0KCcuL3Jlc291cmNlcy9raXR0ZW4uemlwJyksIHMzc2VlZGVyLlNvdXJjZS5hc3NldCgnLi9yZXNvdXJjZXMvcHVwcGllcy56aXAnKSwgczNzZWVkZXIuU291cmNlLmFzc2V0KCcuL3Jlc291cmNlcy9idW5uaWVzLnppcCcpXVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIHZhciBjaWRyUmFuZ2UgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndnBjX2NpZHInKTtcbiAgICAgICAgaWYgKGNpZHJSYW5nZSA9PSB1bmRlZmluZWQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGNpZHJSYW5nZSA9IFwiMTEuMC4wLjAvMTZcIjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgVlBDIHdoZXJlIGFsbCB0aGUgbWljcm9zZXJ2aWNlcyB3aWxsIGJlIGRlcGxveWVkIGludG9cbiAgICAgICAgY29uc3QgdGhlVlBDID0gbmV3IGVjMi5WcGModGhpcywgJ01pY3Jvc2VydmljZXMnLCB7XG4gICAgICAgICAgICBpcEFkZHJlc3NlczogZWMyLklwQWRkcmVzc2VzLmNpZHIoY2lkclJhbmdlKSxcbiAgICAgICAgICAgIC8vIGNpZHI6IGNpZHJSYW5nZSxcbiAgICAgICAgICAgIG5hdEdhdGV3YXlzOiAxLFxuICAgICAgICAgICAgbWF4QXpzOiAyXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENyZWF0ZSBSRFMgQXVyb3JhIFBHIGNsdXN0ZXJcbiAgICAgICAgY29uc3QgcmRzc2VjdXJpdHlncm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAncGV0YWRvcHRpb25zcmRzU0cnLCB7XG4gICAgICAgICAgICB2cGM6IHRoZVZQQ1xuICAgICAgICB9KTtcblxuICAgICAgICByZHNzZWN1cml0eWdyb3VwLmFkZEluZ3Jlc3NSdWxlKGVjMi5QZWVyLmlwdjQodGhlVlBDLnZwY0NpZHJCbG9jayksIGVjMi5Qb3J0LnRjcCg1NDMyKSwgJ0FsbG93IEF1cm9yYSBQRyBhY2Nlc3MgZnJvbSB3aXRoaW4gdGhlIFZQQyBDSURSIHJhbmdlJyk7XG5cbiAgICAgICAgdmFyIHJkc1VzZXJuYW1lID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3Jkc3VzZXJuYW1lJyk7XG4gICAgICAgIGlmIChyZHNVc2VybmFtZSA9PSB1bmRlZmluZWQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJkc1VzZXJuYW1lID0gXCJwZXRhZG1pblwiXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhdXJvcmFDbHVzdGVyID0gbmV3IHJkcy5TZXJ2ZXJsZXNzQ2x1c3Rlcih0aGlzLCAnRGF0YWJhc2UnLCB7XG5cbiAgICAgICAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7IHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzEzXzkgfSksXG4gXG4gICAgICAgICAgICBwYXJhbWV0ZXJHcm91cDogcmRzLlBhcmFtZXRlckdyb3VwLmZyb21QYXJhbWV0ZXJHcm91cE5hbWUodGhpcywgJ1BhcmFtZXRlckdyb3VwJywgJ2RlZmF1bHQuYXVyb3JhLXBvc3RncmVzcWwxMycpLFxuICAgICAgICAgICAgdnBjOiB0aGVWUEMsXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwczogW3Jkc3NlY3VyaXR5Z3JvdXBdLFxuICAgICAgICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ2Fkb3B0aW9ucycsXG4gICAgICAgICAgICBzY2FsaW5nOiB7XG4gICAgICAgICAgICAgICAgYXV0b1BhdXNlOiBEdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICAgICAgICAgICAgICBtaW5DYXBhY2l0eTogcmRzLkF1cm9yYUNhcGFjaXR5VW5pdC5BQ1VfMixcbiAgICAgICAgICAgICAgICBtYXhDYXBhY2l0eTogcmRzLkF1cm9yYUNhcGFjaXR5VW5pdC5BQ1VfOCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICBjb25zdCByZWFkU1NNUGFyYW1zUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVyc0J5UGF0aCcsXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzJyxcbiAgICAgICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcicsXG4gICAgICAgICAgICAgICAgJ2VjMjpEZXNjcmliZVZwY3MnXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGNvbnN0IGRkYlNlZWRQb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6TGlzdFRhYmxlcycsXG4gICAgICAgICAgICAgICAgXCJkeW5hbW9kYjpTY2FuXCIsXG4gICAgICAgICAgICAgICAgXCJkeW5hbW9kYjpRdWVyeVwiXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCByZXBvc2l0b3J5VVJJID0gXCJwdWJsaWMuZWNyLmF3cy9vbmUtb2JzZXJ2YWJpbGl0eS13b3Jrc2hvcFwiO1xuXG4gICAgICAgIGNvbnN0IHN0YWNrID0gU3RhY2sub2YodGhpcyk7XG4gICAgICAgIGNvbnN0IHJlZ2lvbiA9IHN0YWNrLnJlZ2lvbjtcblxuICAgICAgICBjb25zdCBlY3NTZXJ2aWNlc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlcnZpY2VzU0cnLCB7XG4gICAgICAgICAgICB2cGM6IHRoZVZQQ1xuICAgICAgICB9KTtcblxuICAgICAgICBlY3NTZXJ2aWNlc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuaXB2NCh0aGVWUEMudnBjQ2lkckJsb2NrKSwgZWMyLlBvcnQudGNwKDgwKSk7XG5cbiAgICAgICAgY29uc3QgZWNzUGF5Rm9yQWRvcHRpb25DbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsIFwiUGF5Rm9yQWRvcHRpb25cIiwge1xuICAgICAgICAgICAgdnBjOiB0aGVWUEMsXG4gICAgICAgICAgICBjb250YWluZXJJbnNpZ2h0czogdHJ1ZVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gUGF5Rm9yQWRvcHRpb24gc2VydmljZSBkZWZpbml0aW9ucy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIGNvbnN0IHBheUZvckFkb3B0aW9uU2VydmljZSA9IG5ldyBQYXlGb3JBZG9wdGlvblNlcnZpY2UodGhpcywgJ3BheS1mb3ItYWRvcHRpb24tc2VydmljZScsIHtcbiAgICAgICAgICAgIGNsdXN0ZXI6IGVjc1BheUZvckFkb3B0aW9uQ2x1c3RlcixcbiAgICAgICAgICAgIGxvZ0dyb3VwTmFtZTogXCIvZWNzL1BheUZvckFkb3B0aW9uXCIsXG4gICAgICAgICAgICBjcHU6IDEwMjQsXG4gICAgICAgICAgICBtZW1vcnlMaW1pdE1pQjogMjA0OCxcbiAgICAgICAgICAgIGhlYWx0aENoZWNrOiAnL2hlYWx0aC9zdGF0dXMnLFxuICAgICAgICAgICAgLy8gYnVpbGQgbG9jYWxseVxuICAgICAgICAgICAgLy9yZXBvc2l0b3J5VVJJOiByZXBvc2l0b3J5VVJJLFxuICAgICAgICAgICAgZGF0YWJhc2U6IGF1cm9yYUNsdXN0ZXIsXG4gICAgICAgICAgICBkZXNpcmVkVGFza0NvdW50IDogMixcbiAgICAgICAgICAgIHJlZ2lvbjogcmVnaW9uLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cDogZWNzU2VydmljZXNTZWN1cml0eUdyb3VwXG4gICAgICAgIH0pO1xuICAgICAgICBwYXlGb3JBZG9wdGlvblNlcnZpY2UudGFza0RlZmluaXRpb24udGFza1JvbGU/LmFkZFRvUHJpbmNpcGFsUG9saWN5KHJlYWRTU01QYXJhbXNQb2xpY3kpO1xuICAgICAgICBwYXlGb3JBZG9wdGlvblNlcnZpY2UudGFza0RlZmluaXRpb24udGFza1JvbGU/LmFkZFRvUHJpbmNpcGFsUG9saWN5KGRkYlNlZWRQb2xpY3kpO1xuXG5cbiAgICAgICAgY29uc3QgZWNzUGV0TGlzdEFkb3B0aW9uQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCBcIlBldExpc3RBZG9wdGlvbnNcIiwge1xuICAgICAgICAgICAgdnBjOiB0aGVWUEMsXG4gICAgICAgICAgICBjb250YWluZXJJbnNpZ2h0czogdHJ1ZVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gUGV0TGlzdEFkb3B0aW9ucyBzZXJ2aWNlIGRlZmluaXRpb25zLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgY29uc3QgbGlzdEFkb3B0aW9uc1NlcnZpY2UgPSBuZXcgTGlzdEFkb3B0aW9uc1NlcnZpY2UodGhpcywgJ2xpc3QtYWRvcHRpb25zLXNlcnZpY2UnLCB7XG4gICAgICAgICAgICBjbHVzdGVyOiBlY3NQZXRMaXN0QWRvcHRpb25DbHVzdGVyLFxuICAgICAgICAgICAgbG9nR3JvdXBOYW1lOiBcIi9lY3MvUGV0TGlzdEFkb3B0aW9uc1wiLFxuICAgICAgICAgICAgY3B1OiAxMDI0LFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDIwNDgsXG4gICAgICAgICAgICBoZWFsdGhDaGVjazogJy9oZWFsdGgvc3RhdHVzJyxcbiAgICAgICAgICAgIGluc3RydW1lbnRhdGlvbjogJ290ZWwnLFxuICAgICAgICAgICAgLy8gYnVpbGQgbG9jYWxseVxuICAgICAgICAgICAgLy9yZXBvc2l0b3J5VVJJOiByZXBvc2l0b3J5VVJJLFxuICAgICAgICAgICAgZGF0YWJhc2U6IGF1cm9yYUNsdXN0ZXIsXG4gICAgICAgICAgICBkZXNpcmVkVGFza0NvdW50OiAyLFxuICAgICAgICAgICAgcmVnaW9uOiByZWdpb24sXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwOiBlY3NTZXJ2aWNlc1NlY3VyaXR5R3JvdXBcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RBZG9wdGlvbnNTZXJ2aWNlLnRhc2tEZWZpbml0aW9uLnRhc2tSb2xlPy5hZGRUb1ByaW5jaXBhbFBvbGljeShyZWFkU1NNUGFyYW1zUG9saWN5KTtcblxuICAgICAgICBjb25zdCBlY3NQZXRTZWFyY2hDbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsIFwiUGV0U2VhcmNoXCIsIHtcbiAgICAgICAgICAgIHZwYzogdGhlVlBDLFxuICAgICAgICAgICAgY29udGFpbmVySW5zaWdodHM6IHRydWVcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFBldFNlYXJjaCBzZXJ2aWNlIGRlZmluaXRpb25zLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgY29uc3Qgc2VhcmNoU2VydmljZSA9IG5ldyBTZWFyY2hTZXJ2aWNlKHRoaXMsICdzZWFyY2gtc2VydmljZScsIHtcbiAgICAgICAgICAgIGNsdXN0ZXI6IGVjc1BldFNlYXJjaENsdXN0ZXIsXG4gICAgICAgICAgICBsb2dHcm91cE5hbWU6IFwiL2Vjcy9QZXRTZWFyY2hcIixcbiAgICAgICAgICAgIGNwdTogMTAyNCxcbiAgICAgICAgICAgIG1lbW9yeUxpbWl0TWlCOiAyMDQ4LFxuICAgICAgICAgICAgLy9yZXBvc2l0b3J5VVJJOiByZXBvc2l0b3J5VVJJLFxuICAgICAgICAgICAgaGVhbHRoQ2hlY2s6ICcvaGVhbHRoL3N0YXR1cycsXG4gICAgICAgICAgICBkZXNpcmVkVGFza0NvdW50OiAyLFxuICAgICAgICAgICAgaW5zdHJ1bWVudGF0aW9uOiAnb3RlbCcsXG4gICAgICAgICAgICByZWdpb246IHJlZ2lvbixcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IGVjc1NlcnZpY2VzU2VjdXJpdHlHcm91cFxuICAgICAgICB9KVxuICAgICAgICBzZWFyY2hTZXJ2aWNlLnRhc2tEZWZpbml0aW9uLnRhc2tSb2xlPy5hZGRUb1ByaW5jaXBhbFBvbGljeShyZWFkU1NNUGFyYW1zUG9saWN5KTtcblxuICAgICAgICAvLyBUcmFmZmljIEdlbmVyYXRvciB0YXNrIGRlZmluaXRpb24uXG4gICAgICAgIGNvbnN0IHRyYWZmaWNHZW5lcmF0b3JTZXJ2aWNlID0gbmV3IFRyYWZmaWNHZW5lcmF0b3JTZXJ2aWNlKHRoaXMsICd0cmFmZmljLWdlbmVyYXRvci1zZXJ2aWNlJywge1xuICAgICAgICAgICAgY2x1c3RlcjogZWNzUGV0TGlzdEFkb3B0aW9uQ2x1c3RlcixcbiAgICAgICAgICAgIGxvZ0dyb3VwTmFtZTogXCIvZWNzL1BldFRyYWZmaWNHZW5lcmF0b3JcIixcbiAgICAgICAgICAgIGNwdTogMjU2LFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDUxMixcbiAgICAgICAgICAgIGluc3RydW1lbnRhdGlvbjogJ25vbmUnLFxuICAgICAgICAgICAgLy9yZXBvc2l0b3J5VVJJOiByZXBvc2l0b3J5VVJJLFxuICAgICAgICAgICAgZGVzaXJlZFRhc2tDb3VudDogMSxcbiAgICAgICAgICAgIHJlZ2lvbjogcmVnaW9uLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cDogZWNzU2VydmljZXNTZWN1cml0eUdyb3VwXG4gICAgICAgIH0pXG4gICAgICAgIHRyYWZmaWNHZW5lcmF0b3JTZXJ2aWNlLnRhc2tEZWZpbml0aW9uLnRhc2tSb2xlPy5hZGRUb1ByaW5jaXBhbFBvbGljeShyZWFkU1NNUGFyYW1zUG9saWN5KTtcblxuICAgICAgICAvL1BldFN0YXR1c1VwZGF0ZXIgTGFtYmRhIEZ1bmN0aW9uIGFuZCBBUElHVy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIGNvbnN0IHN0YXR1c1VwZGF0ZXJTZXJ2aWNlID0gbmV3IFN0YXR1c1VwZGF0ZXJTZXJ2aWNlKHRoaXMsICdzdGF0dXMtdXBkYXRlci1zZXJ2aWNlJywge1xuICAgICAgICAgICAgdGFibGVOYW1lOiBkeW5hbW9kYl9wZXRhZG9wdGlvbi50YWJsZU5hbWVcbiAgICAgICAgfSk7XG5cblxuICAgICAgICBjb25zdCBhbGJTRyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCdBTEJTZWN1cml0eUdyb3VwJyx7XG4gICAgICAgICAgICB2cGM6IHRoZVZQQyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBOYW1lOiAnQUxCU2VjdXJpdHlHcm91cCcsXG4gICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgICAgIH0pO1xuICAgICAgICBhbGJTRy5hZGRJbmdyZXNzUnVsZShlYzIuUGVlci5hbnlJcHY0KCksZWMyLlBvcnQudGNwKDgwKSk7XG5cbiAgICAgICAgLy8gUGV0U2l0ZSAtIENyZWF0ZSBBTEIgYW5kIFRhcmdldCBHcm91cHNcbiAgICAgICAgY29uc3QgYWxiID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdQZXRTaXRlTG9hZEJhbGFuY2VyJywge1xuICAgICAgICAgICAgdnBjOiB0aGVWUEMsXG4gICAgICAgICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IGFsYlNHXG4gICAgICAgIH0pO1xuICAgICAgICB0cmFmZmljR2VuZXJhdG9yU2VydmljZS5ub2RlLmFkZERlcGVuZGVuY3koYWxiKTtcblxuICAgICAgICBjb25zdCB0YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdQZXRTaXRlVGFyZ2V0R3JvdXAnLCB7XG4gICAgICAgICAgICBwb3J0OiA4MCxcbiAgICAgICAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICAgICAgICB2cGM6IHRoZVZQQyxcbiAgICAgICAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVBcblxuICAgICAgICB9KTtcblxuICAgICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLFwicHV0UGFyYW1UYXJnZXRHcm91cEFyblwiLHtcbiAgICAgICAgICAgIHN0cmluZ1ZhbHVlOiB0YXJnZXRHcm91cC50YXJnZXRHcm91cEFybixcbiAgICAgICAgICAgIHBhcmFtZXRlck5hbWU6ICcvZWtzL3BldHNpdGUvVGFyZ2V0R3JvdXBBcm4nXG4gICAgICAgICAgfSlcblxuICAgICAgICBjb25zdCBsaXN0ZW5lciA9IGFsYi5hZGRMaXN0ZW5lcignTGlzdGVuZXInLCB7XG4gICAgICAgICAgICBwb3J0OiA4MCxcbiAgICAgICAgICAgIG9wZW46IHRydWUsXG4gICAgICAgICAgICBkZWZhdWx0VGFyZ2V0R3JvdXBzOiBbdGFyZ2V0R3JvdXBdLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBQZXRBZG9wdGlvbkhpc3RvcnkgLSBhdHRhY2ggc2VydmljZSB0byBwYXRoIC9wZXRhZG9wdGlvbmhpc3Rvcnkgb24gUGV0U2l0ZSBBTEJcbiAgICAgICAgY29uc3QgcGV0YWRvcHRpb25zaGlzdG9yeV90YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdQZXRBZG9wdGlvbnNIaXN0b3J5VGFyZ2V0R3JvdXAnLCB7XG4gICAgICAgICAgICBwb3J0OiA4MCxcbiAgICAgICAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICAgICAgICB2cGM6IHRoZVZQQyxcbiAgICAgICAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICAgICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICAgICAgICAgIHBhdGg6ICcvaGVhbHRoL3N0YXR1cycsXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxpc3RlbmVyLmFkZFRhcmdldEdyb3VwcygnUGV0QWRvcHRpb25zSGlzdG9yeVRhcmdldEdyb3VwcycsIHtcbiAgICAgICAgICAgIHByaW9yaXR5OiAxMCxcbiAgICAgICAgICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICAgICAgICAgICBlbGJ2Mi5MaXN0ZW5lckNvbmRpdGlvbi5wYXRoUGF0dGVybnMoWycvcGV0YWRvcHRpb25zaGlzdG9yeS8qJ10pLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHRhcmdldEdyb3VwczogW3BldGFkb3B0aW9uc2hpc3RvcnlfdGFyZ2V0R3JvdXBdXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsXCJwdXRQZXRIaXN0b3J5UGFyYW1UYXJnZXRHcm91cEFyblwiLHtcbiAgICAgICAgICAgIHN0cmluZ1ZhbHVlOiBwZXRhZG9wdGlvbnNoaXN0b3J5X3RhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9la3MvcGV0aGlzdG9yeS9UYXJnZXRHcm91cEFybidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUGV0U2l0ZSAtIEVLUyBDbHVzdGVyXG4gICAgICAgIGNvbnN0IGNsdXN0ZXJBZG1pbiA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQWRtaW5Sb2xlJywge1xuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkFjY291bnRSb290UHJpbmNpcGFsKClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcyxcInB1dFBhcmFtXCIse1xuICAgICAgICAgICAgc3RyaW5nVmFsdWU6IGNsdXN0ZXJBZG1pbi5yb2xlQXJuLFxuICAgICAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9la3MvcGV0c2l0ZS9FS1NNYXN0ZXJSb2xlQXJuJ1xuICAgICAgICAgIH0pXG5cbiAgICAgICAgY29uc3Qgc2VjcmV0c0tleSA9IG5ldyBrbXMuS2V5KHRoaXMsICdTZWNyZXRzS2V5Jyk7XG4gICAgICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWtzLkNsdXN0ZXIodGhpcywgJ3BldHNpdGUnLCB7XG4gICAgICAgICAgICBjbHVzdGVyTmFtZTogJ1BldFNpdGUnLFxuICAgICAgICAgICAgbWFzdGVyc1JvbGU6IGNsdXN0ZXJBZG1pbixcbiAgICAgICAgICAgIHZwYzogdGhlVlBDLFxuICAgICAgICAgICAgZGVmYXVsdENhcGFjaXR5OiAyLFxuICAgICAgICAgICAgZGVmYXVsdENhcGFjaXR5SW5zdGFuY2U6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTUVESVVNKSxcbiAgICAgICAgICAgIHNlY3JldHNFbmNyeXB0aW9uS2V5OiBzZWNyZXRzS2V5LFxuICAgICAgICAgICAgdmVyc2lvbjogS3ViZXJuZXRlc1ZlcnNpb24ub2YoJzEuMjcnKSxcbiAgICAgICAgICAgIGt1YmVjdGxMYXllcjogbmV3IEt1YmVjdGxMYXllcih0aGlzLCAna3ViZWN0bCcpIFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjbHVzdGVyU0cgPSBlYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsJ0NsdXN0ZXJTRycsY2x1c3Rlci5jbHVzdGVyU2VjdXJpdHlHcm91cElkKTtcbiAgICAgICAgY2x1c3RlclNHLmFkZEluZ3Jlc3NSdWxlKGFsYlNHLGVjMi5Qb3J0LmFsbFRyYWZmaWMoKSwnQWxsb3cgdHJhZmZpYyBmcm9tIHRoZSBBTEInKTtcbiAgICAgICAgY2x1c3RlclNHLmFkZEluZ3Jlc3NSdWxlKGVjMi5QZWVyLmlwdjQodGhlVlBDLnZwY0NpZHJCbG9jayksZWMyLlBvcnQudGNwKDQ0MyksJ0FsbG93IGxvY2FsIGFjY2VzcyB0byBrOHMgYXBpJyk7XG5cblxuICAgICAgICAvLyBBZGQgU1NNIFBlcm1pc3Npb25zIHRvIHRoZSBub2RlIHJvbGVcbiAgICAgICAgY2x1c3Rlci5kZWZhdWx0Tm9kZWdyb3VwPy5yb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZVwiKSk7XG5cbiAgICAgICAgLy8gRnJvbSBodHRwczovL2dpdGh1Yi5jb20vYXdzLXNhbXBsZXMvc3NtLWFnZW50LWRhZW1vbnNldC1pbnN0YWxsZXJcbiAgICAgICAgdmFyIHNzbUFnZW50U2V0dXAgPSB5YW1sLmxvYWRBbGwocmVhZEZpbGVTeW5jKFwiLi9yZXNvdXJjZXMvc2V0dXAtc3NtLWFnZW50LnlhbWxcIixcInV0ZjhcIikpIGFzIFJlY29yZDxzdHJpbmcsYW55PltdO1xuXG4gICAgICAgIGNvbnN0IHNzbUFnZW50U2V0dXBNYW5pZmVzdCA9IG5ldyBla3MuS3ViZXJuZXRlc01hbmlmZXN0KHRoaXMsXCJzc21BZ2VudGRlcGxveW1lbnRcIix7XG4gICAgICAgICAgICBjbHVzdGVyOiBjbHVzdGVyLFxuICAgICAgICAgICAgbWFuaWZlc3Q6IHNzbUFnZW50U2V0dXBcbiAgICAgICAgfSk7XG5cblxuXG4gICAgICAgIC8vIENsdXN0ZXJJRCBpcyBub3QgYXZhaWxhYmxlIGZvciBjcmVhdGluZyB0aGUgcHJvcGVyIGNvbmRpdGlvbnMgaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy8xMDM0N1xuICAgICAgICBjb25zdCBjbHVzdGVySWQgPSBGbi5zZWxlY3QoNCwgRm4uc3BsaXQoJy8nLCBjbHVzdGVyLmNsdXN0ZXJPcGVuSWRDb25uZWN0SXNzdWVyVXJsKSkgLy8gUmVtb3ZlIGh0dHBzOi8vIGZyb20gdGhlIFVSTCBhcyB3b3JrYXJvdW5kIHRvIGdldCBDbHVzdGVySURcblxuICAgICAgICBjb25zdCBjd19mZWRlcmF0ZWRQcmluY2lwYWwgPSBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgICAgIGNsdXN0ZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBTdHJpbmdFcXVhbHM6IG5ldyBDZm5Kc29uKHRoaXMsIFwiQ1dfRmVkZXJhdGVkUHJpbmNpcGFsQ29uZGl0aW9uXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFtgb2lkYy5la3MuJHtyZWdpb259LmFtYXpvbmF3cy5jb20vaWQvJHtjbHVzdGVySWR9OmF1ZGAgXTogXCJzdHMuYW1hem9uYXdzLmNvbVwiXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBjb25zdCBjd190cnVzdFJlbGF0aW9uc2hpcCA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFsgY3dfZmVkZXJhdGVkUHJpbmNpcGFsIF0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXCJzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eVwiXVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDcmVhdGUgSUFNIHJvbGVzIGZvciBTZXJ2aWNlIEFjY291bnRzXG4gICAgICAgIC8vIENsb3Vkd2F0Y2ggQWdlbnQgU0FcbiAgICAgICAgY29uc3QgY3dzZXJ2aWNlYWNjb3VudCA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ1dTZXJ2aWNlQWNjb3VudCcsIHtcbi8vICAgICAgICAgICAgICAgIGFzc3VtZWRCeTogZWtzRmVkZXJhdGVkUHJpbmNpcGFsLFxuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkFjY291bnRSb290UHJpbmNpcGFsKCksXG4gICAgICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tTWFuYWdlZFBvbGljeUFybih0aGlzLCAnQ1dTZXJ2aWNlQWNjb3VudC1DbG91ZFdhdGNoQWdlbnRTZXJ2ZXJQb2xpY3knLCAnYXJuOmF3czppYW06OmF3czpwb2xpY3kvQ2xvdWRXYXRjaEFnZW50U2VydmVyUG9saWN5JylcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgICAgICBjd3NlcnZpY2VhY2NvdW50LmFzc3VtZVJvbGVQb2xpY3k/LmFkZFN0YXRlbWVudHMoY3dfdHJ1c3RSZWxhdGlvbnNoaXApO1xuXG4gICAgICAgIGNvbnN0IHhyYXlfZmVkZXJhdGVkUHJpbmNpcGFsID0gbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgICAgICAgICBjbHVzdGVyLm9wZW5JZENvbm5lY3RQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiBuZXcgQ2ZuSnNvbih0aGlzLCBcIlhyYXlfRmVkZXJhdGVkUHJpbmNpcGFsQ29uZGl0aW9uXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFtgb2lkYy5la3MuJHtyZWdpb259LmFtYXpvbmF3cy5jb20vaWQvJHtjbHVzdGVySWR9OmF1ZGAgXTogXCJzdHMuYW1hem9uYXdzLmNvbVwiXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBjb25zdCB4cmF5X3RydXN0UmVsYXRpb25zaGlwID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogWyB4cmF5X2ZlZGVyYXRlZFByaW5jaXBhbCBdLFxuICAgICAgICAgICAgYWN0aW9uczogW1wic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIl1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gWC1SYXkgQWdlbnQgU0FcbiAgICAgICAgY29uc3QgeHJheXNlcnZpY2VhY2NvdW50ID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdYUmF5U2VydmljZUFjY291bnQnLCB7XG4vLyAgICAgICAgICAgICAgICBhc3N1bWVkQnk6IGVrc0ZlZGVyYXRlZFByaW5jaXBhbCxcbiAgICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5BY2NvdW50Um9vdFByaW5jaXBhbCgpLFxuICAgICAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbU1hbmFnZWRQb2xpY3lBcm4odGhpcywgJ1hSYXlTZXJ2aWNlQWNjb3VudC1BV1NYUmF5RGFlbW9uV3JpdGVBY2Nlc3MnLCAnYXJuOmF3czppYW06OmF3czpwb2xpY3kvQVdTWFJheURhZW1vbldyaXRlQWNjZXNzJylcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgICAgICB4cmF5c2VydmljZWFjY291bnQuYXNzdW1lUm9sZVBvbGljeT8uYWRkU3RhdGVtZW50cyh4cmF5X3RydXN0UmVsYXRpb25zaGlwKTtcblxuICAgICAgICBjb25zdCBsb2FkYmFsYW5jZXJfZmVkZXJhdGVkUHJpbmNpcGFsID0gbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgICAgICAgICBjbHVzdGVyLm9wZW5JZENvbm5lY3RQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiBuZXcgQ2ZuSnNvbih0aGlzLCBcIkxCX0ZlZGVyYXRlZFByaW5jaXBhbENvbmRpdGlvblwiLCB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBbYG9pZGMuZWtzLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tL2lkLyR7Y2x1c3RlcklkfTphdWRgIF06IFwic3RzLmFtYXpvbmF3cy5jb21cIlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgbG9hZEJhbGFuY2VyX3RydXN0UmVsYXRpb25zaGlwID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogWyBsb2FkYmFsYW5jZXJfZmVkZXJhdGVkUHJpbmNpcGFsIF0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXCJzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eVwiXVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBsb2FkQmFsYW5jZXJQb2xpY3lEb2MgPSBpYW0uUG9saWN5RG9jdW1lbnQuZnJvbUpzb24oSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoXCIuL3Jlc291cmNlcy9sb2FkX2JhbGFuY2VyL2lhbV9wb2xpY3kuanNvblwiLFwidXRmOFwiKSkpO1xuICAgICAgICBjb25zdCBsb2FkQmFsYW5jZXJQb2xpY3kgPSBuZXcgaWFtLk1hbmFnZWRQb2xpY3kodGhpcywnTG9hZEJhbGFuY2VyU0FQb2xpY3knLCB7IGRvY3VtZW50OiBsb2FkQmFsYW5jZXJQb2xpY3lEb2MgfSk7XG4gICAgICAgIGNvbnN0IGxvYWRCYWxhbmNlcnNlcnZpY2VhY2NvdW50ID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMb2FkQmFsYW5jZXJTZXJ2aWNlQWNjb3VudCcsIHtcbi8vICAgICAgICAgICAgICAgIGFzc3VtZWRCeTogZWtzRmVkZXJhdGVkUHJpbmNpcGFsLFxuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkFjY291bnRSb290UHJpbmNpcGFsKCksXG4gICAgICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtsb2FkQmFsYW5jZXJQb2xpY3ldXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxvYWRCYWxhbmNlcnNlcnZpY2VhY2NvdW50LmFzc3VtZVJvbGVQb2xpY3k/LmFkZFN0YXRlbWVudHMobG9hZEJhbGFuY2VyX3RydXN0UmVsYXRpb25zaGlwKTtcblxuICAgICAgICAvLyBGaXggZm9yIEVLUyBEYXNoYm9hcmQgYWNjZXNzXG5cbiAgICAgICAgY29uc3QgZGFzaGJvYXJkUm9sZVlhbWwgPSB5YW1sLmxvYWRBbGwocmVhZEZpbGVTeW5jKFwiLi9yZXNvdXJjZXMvZGFzaGJvYXJkLnlhbWxcIixcInV0ZjhcIikpIGFzIFJlY29yZDxzdHJpbmcsYW55PltdO1xuXG4gICAgICAgIGNvbnN0IGRhc2hib2FyZFJvbGVBcm4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZGFzaGJvYXJkX3JvbGVfYXJuJyk7XG4gICAgICAgIGlmKChkYXNoYm9hcmRSb2xlQXJuICE9IHVuZGVmaW5lZCkmJihkYXNoYm9hcmRSb2xlQXJuLmxlbmd0aCA+IDApKSB7XG4gICAgICAgICAgICBjb25zdCByb2xlID0gaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgXCJEYXNoYm9hcmRSb2xlQXJuXCIsZGFzaGJvYXJkUm9sZUFybix7bXV0YWJsZTpmYWxzZX0pO1xuICAgICAgICAgICAgY2x1c3Rlci5hd3NBdXRoLmFkZFJvbGVNYXBwaW5nKHJvbGUse2dyb3VwczpbXCJkYXNoYm9hcmQtdmlld1wiXX0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzRXZlbnRFbmdpbmUgPT09ICd0cnVlJylcbiAgICAgICAge1xuXG4gICAgICAgICAgICB2YXIgYzlFbnYgPSBuZXcgQ2xvdWQ5RW52aXJvbm1lbnQodGhpcywgJ0Nsb3VkOUVudmlyb25tZW50Jywge1xuICAgICAgICAgICAgICAgIHZwY0lkOiB0aGVWUEMudnBjSWQsXG4gICAgICAgICAgICAgICAgc3VibmV0SWQ6IHRoZVZQQy5wdWJsaWNTdWJuZXRzWzBdLnN1Ym5ldElkLFxuICAgICAgICAgICAgICAgIGNsb3VkOU93bmVyQXJuOiBcImFzc3VtZWQtcm9sZS9XU1BhcnRpY2lwYW50Um9sZS9QYXJ0aWNpcGFudFwiLFxuICAgICAgICAgICAgICAgIHRlbXBsYXRlRmlsZTogX19kaXJuYW1lICsgXCIvLi4vLi4vLi4vLi4vY2xvdWQ5LWNmbi55YW1sXCJcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgfSk7XG4gICAgXG4gICAgICAgICAgICB2YXIgYzlyb2xlID0gYzlFbnYuYzlSb2xlO1xuXG4gICAgICAgICAgICAvLyBEeW5hbWljYWxseSBjaGVjayBpZiBBV1NDbG91ZDlTU01BY2Nlc3NSb2xlIGFuZCBBV1NDbG91ZDlTU01JbnN0YW5jZVByb2ZpbGUgZXhpc3RzXG4gICAgICAgICAgICBjb25zdCBjOVNTTVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywnQVdTQ2xvdWQ5U1NNQWNjZXNzUm9sZScsIHtcbiAgICAgICAgICAgICAgICBwYXRoOiAnL3NlcnZpY2Utcm9sZS8nLFxuICAgICAgICAgICAgICAgIHJvbGVOYW1lOiAnQVdTQ2xvdWQ5U1NNQWNjZXNzUm9sZScsXG4gICAgICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJlYzIuYW1hem9uYXdzLmNvbVwiKSwgbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiY2xvdWQ5LmFtYXpvbmF3cy5jb21cIikpLFxuICAgICAgICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW2lhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFXU0Nsb3VkOVNTTUluc3RhbmNlUHJvZmlsZVwiKSxpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBZG1pbmlzdHJhdG9yQWNjZXNzXCIpXVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHRlYW1Sb2xlID0gaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywnVGVhbVJvbGUnLFwiYXJuOmF3czppYW06OlwiICsgc3RhY2suYWNjb3VudCArXCI6cm9sZS9XU1BhcnRpY2lwYW50Um9sZVwiKTtcbiAgICAgICAgICAgIGNsdXN0ZXIuYXdzQXV0aC5hZGRSb2xlTWFwcGluZyh0ZWFtUm9sZSx7Z3JvdXBzOltcImRhc2hib2FyZC12aWV3XCJdfSk7XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgaWYgKGM5cm9sZSE9dW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2x1c3Rlci5hd3NBdXRoLmFkZE1hc3RlcnNSb2xlKGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdjOXJvbGUnLCBjOXJvbGUuYXR0ckFybiwgeyBtdXRhYmxlOiBmYWxzZSB9KSk7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZWtzQWRtaW5Bcm4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnYWRtaW5fcm9sZScpO1xuICAgICAgICBpZiAoKGVrc0FkbWluQXJuIT11bmRlZmluZWQpJiYoZWtzQWRtaW5Bcm4ubGVuZ3RoID4gMCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBpYW0uUm9sZS5mcm9tUm9sZUFybih0aGlzLFwiZWtkQWRtaW5Sb2xlQXJuXCIsZWtzQWRtaW5Bcm4se211dGFibGU6ZmFsc2V9KTtcbiAgICAgICAgICAgIGNsdXN0ZXIuYXdzQXV0aC5hZGRNYXN0ZXJzUm9sZShyb2xlKVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGFoc2hib2FyZE1hbmlmZXN0ID0gbmV3IGVrcy5LdWJlcm5ldGVzTWFuaWZlc3QodGhpcyxcIms4c2Rhc2hib2FyZHJiYWNcIix7XG4gICAgICAgICAgICBjbHVzdGVyOiBjbHVzdGVyLFxuICAgICAgICAgICAgbWFuaWZlc3Q6IGRhc2hib2FyZFJvbGVZYW1sXG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdmFyIHhSYXlZYW1sID0geWFtbC5sb2FkQWxsKHJlYWRGaWxlU3luYyhcIi4vcmVzb3VyY2VzL2s4c19wZXRzaXRlL3hyYXktZGFlbW9uLWNvbmZpZy55YW1sXCIsXCJ1dGY4XCIpKSBhcyBSZWNvcmQ8c3RyaW5nLGFueT5bXTtcblxuICAgICAgICB4UmF5WWFtbFswXS5tZXRhZGF0YS5hbm5vdGF0aW9uc1tcImVrcy5hbWF6b25hd3MuY29tL3JvbGUtYXJuXCJdID0gbmV3IENmbkpzb24odGhpcywgXCJ4cmF5X1JvbGVcIiwgeyB2YWx1ZSA6IGAke3hyYXlzZXJ2aWNlYWNjb3VudC5yb2xlQXJufWAgfSk7XG5cbiAgICAgICAgY29uc3QgeHJheU1hbmlmZXN0ID0gbmV3IGVrcy5LdWJlcm5ldGVzTWFuaWZlc3QodGhpcyxcInhyYXlkZXBsb3ltZW50XCIse1xuICAgICAgICAgICAgY2x1c3RlcjogY2x1c3RlcixcbiAgICAgICAgICAgIG1hbmlmZXN0OiB4UmF5WWFtbFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbG9hZEJhbGFuY2VyU2VydmljZUFjY291bnRZYW1sICA9IHlhbWwubG9hZEFsbChyZWFkRmlsZVN5bmMoXCIuL3Jlc291cmNlcy9sb2FkX2JhbGFuY2VyL3NlcnZpY2VfYWNjb3VudC55YW1sXCIsXCJ1dGY4XCIpKSBhcyBSZWNvcmQ8c3RyaW5nLGFueT5bXTtcbiAgICAgICAgbG9hZEJhbGFuY2VyU2VydmljZUFjY291bnRZYW1sWzBdLm1ldGFkYXRhLmFubm90YXRpb25zW1wiZWtzLmFtYXpvbmF3cy5jb20vcm9sZS1hcm5cIl0gPSBuZXcgQ2ZuSnNvbih0aGlzLCBcImxvYWRCYWxhbmNlcl9Sb2xlXCIsIHsgdmFsdWUgOiBgJHtsb2FkQmFsYW5jZXJzZXJ2aWNlYWNjb3VudC5yb2xlQXJufWAgfSk7XG5cbiAgICAgICAgY29uc3QgbG9hZEJhbGFuY2VyU2VydmljZUFjY291bnQgPSBuZXcgZWtzLkt1YmVybmV0ZXNNYW5pZmVzdCh0aGlzLCBcImxvYWRCYWxhbmNlclNlcnZpY2VBY2NvdW50XCIse1xuICAgICAgICAgICAgY2x1c3RlcjogY2x1c3RlcixcbiAgICAgICAgICAgIG1hbmlmZXN0OiBsb2FkQmFsYW5jZXJTZXJ2aWNlQWNjb3VudFlhbWxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgd2FpdEZvckxCU2VydmljZUFjY291bnQgPSBuZXcgZWtzLkt1YmVybmV0ZXNPYmplY3RWYWx1ZSh0aGlzLCdMQlNlcnZpY2VBY2NvdW50Jyx7XG4gICAgICAgICAgICBjbHVzdGVyOiBjbHVzdGVyLFxuICAgICAgICAgICAgb2JqZWN0TmFtZTogXCJhbGItaW5ncmVzcy1jb250cm9sbGVyXCIsXG4gICAgICAgICAgICBvYmplY3RUeXBlOiBcInNlcnZpY2VhY2NvdW50XCIsXG4gICAgICAgICAgICBvYmplY3ROYW1lc3BhY2U6IFwia3ViZS1zeXN0ZW1cIixcbiAgICAgICAgICAgIGpzb25QYXRoOiBcIkBcIlxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBsb2FkQmFsYW5jZXJDUkRZYW1sID0geWFtbC5sb2FkQWxsKHJlYWRGaWxlU3luYyhcIi4vcmVzb3VyY2VzL2xvYWRfYmFsYW5jZXIvY3Jkcy55YW1sXCIsXCJ1dGY4XCIpKSBhcyBSZWNvcmQ8c3RyaW5nLGFueT5bXTtcbiAgICAgICAgY29uc3QgbG9hZEJhbGFuY2VyQ1JETWFuaWZlc3QgPSBuZXcgZWtzLkt1YmVybmV0ZXNNYW5pZmVzdCh0aGlzLFwibG9hZEJhbGFuY2VyQ1JEXCIse1xuICAgICAgICAgICAgY2x1c3RlcjogY2x1c3RlcixcbiAgICAgICAgICAgIG1hbmlmZXN0OiBsb2FkQmFsYW5jZXJDUkRZYW1sXG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgY29uc3QgYXdzTG9hZEJhbGFuY2VyTWFuaWZlc3QgPSBuZXcgZWtzLkhlbG1DaGFydCh0aGlzLCBcIkFXU0xvYWRCYWxhbmNlckNvbnRyb2xsZXJcIiwge1xuICAgICAgICAgICAgY2x1c3RlcjogY2x1c3RlcixcbiAgICAgICAgICAgIGNoYXJ0OiBcImF3cy1sb2FkLWJhbGFuY2VyLWNvbnRyb2xsZXJcIixcbiAgICAgICAgICAgIHJlcG9zaXRvcnk6IFwiaHR0cHM6Ly9hd3MuZ2l0aHViLmlvL2Vrcy1jaGFydHNcIixcbiAgICAgICAgICAgIG5hbWVzcGFjZTogXCJrdWJlLXN5c3RlbVwiLFxuICAgICAgICAgICAgdmFsdWVzOiB7XG4gICAgICAgICAgICBjbHVzdGVyTmFtZTpcIlBldFNpdGVcIixcbiAgICAgICAgICAgIHNlcnZpY2VBY2NvdW50OntcbiAgICAgICAgICAgICAgICBjcmVhdGU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG5hbWU6IFwiYWxiLWluZ3Jlc3MtY29udHJvbGxlclwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgd2FpdDogdHJ1ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgYXdzTG9hZEJhbGFuY2VyTWFuaWZlc3Qubm9kZS5hZGREZXBlbmRlbmN5KGxvYWRCYWxhbmNlckNSRE1hbmlmZXN0KTtcbiAgICAgICAgYXdzTG9hZEJhbGFuY2VyTWFuaWZlc3Qubm9kZS5hZGREZXBlbmRlbmN5KGxvYWRCYWxhbmNlclNlcnZpY2VBY2NvdW50KTtcbiAgICAgICAgYXdzTG9hZEJhbGFuY2VyTWFuaWZlc3Qubm9kZS5hZGREZXBlbmRlbmN5KHdhaXRGb3JMQlNlcnZpY2VBY2NvdW50KTtcblxuXG4gICAgICAgIC8vIE5PVEU6IEFtYXpvbiBDbG91ZFdhdGNoIE9ic2VydmFiaWxpdHkgQWRkb24gZm9yIENsb3VkV2F0Y2ggQWdlbnQgYW5kIEZsdWVudGJpdFxuICAgICAgICBjb25zdCBvdGVsQWRkb24gPSBuZXcgZWtzLkNmbkFkZG9uKHRoaXMsICdvdGVsT2JzZXJ2YWJpbGl0eUFkZG9uJywge1xuICAgICAgICAgICAgYWRkb25OYW1lOiAnYW1hem9uLWNsb3Vkd2F0Y2gtb2JzZXJ2YWJpbGl0eScsXG4gICAgICAgICAgICBjbHVzdGVyTmFtZTogY2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgICAgICAgIC8vIHRoZSBwcm9wZXJ0aWVzIGJlbG93IGFyZSBvcHRpb25hbFxuICAgICAgICAgICAgcmVzb2x2ZUNvbmZsaWN0czogJ09WRVJXUklURScsXG4gICAgICAgICAgICBwcmVzZXJ2ZU9uRGVsZXRlOiBmYWxzZSxcbiAgICAgICAgICAgIHNlcnZpY2VBY2NvdW50Um9sZUFybjogY3dzZXJ2aWNlYWNjb3VudC5yb2xlQXJuLFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGN1c3RvbVdpZGdldFJlc291cmNlQ29udHJvbGxlclBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZWNzOkxpc3RTZXJ2aWNlcycsXG4gICAgICAgICAgICAgICAgJ2VjczpVcGRhdGVTZXJ2aWNlJyxcbiAgICAgICAgICAgICAgICAnZWtzOkRlc2NyaWJlTm9kZWdyb3VwJyxcbiAgICAgICAgICAgICAgICAnZWtzOkxpc3ROb2RlZ3JvdXBzJyxcbiAgICAgICAgICAgICAgICAnZWtzOkRlc2NyaWJlVXBkYXRlJyxcbiAgICAgICAgICAgICAgICAnZWtzOlVwZGF0ZU5vZGVncm91cENvbmZpZycsXG4gICAgICAgICAgICAgICAgJ2VjczpEZXNjcmliZVNlcnZpY2VzJyxcbiAgICAgICAgICAgICAgICAnZWtzOkRlc2NyaWJlQ2x1c3RlcicsXG4gICAgICAgICAgICAgICAgJ2VrczpMaXN0Q2x1c3RlcnMnLFxuICAgICAgICAgICAgICAgICdlY3M6TGlzdENsdXN0ZXJzJ1xuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ11cbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBjdXN0b21XaWRnZXRMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdjdXN0b21XaWRnZXRMYW1iZGFSb2xlJywge1xuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICAgIH0pO1xuICAgICAgICBjdXN0b21XaWRnZXRMYW1iZGFSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KGN1c3RvbVdpZGdldFJlc291cmNlQ29udHJvbGxlclBvbGljeSk7XG5cbiAgICAgICAgdmFyIHBldHNpdGVBcHBsaWNhdGlvblJlc291cmNlQ29udHJvbGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3BldHNpdGUtYXBwbGljYXRpb24tcmVzb3VyY2UtY29udHJvbGVyJywge1xuICAgICAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcvLi4vcmVzb3VyY2VzL3Jlc291cmNlLWNvbnRyb2xsZXItd2lkZ2V0JykpLFxuICAgICAgICAgICAgaGFuZGxlcjogJ3BldHNpdGUtYXBwbGljYXRpb24tcmVzb3VyY2UtY29udHJvbGVyLmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgICAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICAgICAgICByb2xlOiBjdXN0b21XaWRnZXRMYW1iZGFSb2xlLFxuICAgICAgICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcygxMClcbiAgICAgICAgfSk7XG4gICAgICAgIHBldHNpdGVBcHBsaWNhdGlvblJlc291cmNlQ29udHJvbGxlci5hZGRFbnZpcm9ubWVudChcIkVLU19DTFVTVEVSX05BTUVcIiwgY2x1c3Rlci5jbHVzdGVyTmFtZSk7XG4gICAgICAgIHBldHNpdGVBcHBsaWNhdGlvblJlc291cmNlQ29udHJvbGxlci5hZGRFbnZpcm9ubWVudChcIkVDU19DTFVTVEVSX0FSTlNcIiwgZWNzUGF5Rm9yQWRvcHRpb25DbHVzdGVyLmNsdXN0ZXJBcm4gKyBcIixcIiArXG4gICAgICAgICAgICBlY3NQZXRMaXN0QWRvcHRpb25DbHVzdGVyLmNsdXN0ZXJBcm4gKyBcIixcIiArIGVjc1BldFNlYXJjaENsdXN0ZXIuY2x1c3RlckFybik7XG5cbiAgICAgICAgdmFyIGN1c3RvbVdpZGdldEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnY2xvdWR3YXRjaC1jdXN0b20td2lkZ2V0Jywge1xuICAgICAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcvLi4vcmVzb3VyY2VzL3Jlc291cmNlLWNvbnRyb2xsZXItd2lkZ2V0JykpLFxuICAgICAgICAgICAgaGFuZGxlcjogJ2Nsb3Vkd2F0Y2gtY3VzdG9tLXdpZGdldC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgICAgICAgcm9sZTogY3VzdG9tV2lkZ2V0TGFtYmRhUm9sZSxcbiAgICAgICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNjApXG4gICAgICAgIH0pO1xuICAgICAgICBjdXN0b21XaWRnZXRGdW5jdGlvbi5hZGRFbnZpcm9ubWVudChcIkNPTlRST0xFUl9MQU1CREFfQVJOXCIsIHBldHNpdGVBcHBsaWNhdGlvblJlc291cmNlQ29udHJvbGxlci5mdW5jdGlvbkFybik7XG4gICAgICAgIGN1c3RvbVdpZGdldEZ1bmN0aW9uLmFkZEVudmlyb25tZW50KFwiRUtTX0NMVVNURVJfTkFNRVwiLCBjbHVzdGVyLmNsdXN0ZXJOYW1lKTtcbiAgICAgICAgY3VzdG9tV2lkZ2V0RnVuY3Rpb24uYWRkRW52aXJvbm1lbnQoXCJFQ1NfQ0xVU1RFUl9BUk5TXCIsIGVjc1BheUZvckFkb3B0aW9uQ2x1c3Rlci5jbHVzdGVyQXJuICsgXCIsXCIgK1xuICAgICAgICAgICAgZWNzUGV0TGlzdEFkb3B0aW9uQ2x1c3Rlci5jbHVzdGVyQXJuICsgXCIsXCIgKyBlY3NQZXRTZWFyY2hDbHVzdGVyLmNsdXN0ZXJBcm4pO1xuXG4gICAgICAgIHZhciBjb3N0Q29udHJvbERhc2hib2FyZEJvZHkgPSByZWFkRmlsZVN5bmMoXCIuL3Jlc291cmNlcy9jd19kYXNoYm9hcmRfY29zdF9jb250cm9sLmpzb25cIixcInV0Zi04XCIpO1xuICAgICAgICBjb3N0Q29udHJvbERhc2hib2FyZEJvZHkgPSBjb3N0Q29udHJvbERhc2hib2FyZEJvZHkucmVwbGFjZUFsbChcInt7WU9VUl9MQU1CREFfQVJOfX1cIixjdXN0b21XaWRnZXRGdW5jdGlvbi5mdW5jdGlvbkFybik7XG5cbiAgICAgICAgY29uc3QgcGV0U2l0ZUNvc3RDb250cm9sRGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guQ2ZuRGFzaGJvYXJkKHRoaXMsIFwiUGV0U2l0ZUNvc3RDb250cm9sRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgICAgIGRhc2hib2FyZE5hbWU6IFwiUGV0U2l0ZV9Db3N0X0NvbnRyb2xfRGFzaGJvYXJkXCIsXG4gICAgICAgICAgICBkYXNoYm9hcmRCb2R5OiBjb3N0Q29udHJvbERhc2hib2FyZEJvZHlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ3JlYXRpbmcgQVdTIFJlc291cmNlIEdyb3VwIGZvciBhbGwgdGhlIHJlc291cmNlcyBvZiBzdGFjay5cbiAgICAgICAgY29uc3Qgc2VydmljZXNDZm5Hcm91cCA9IG5ldyByZXNvdXJjZWdyb3Vwcy5DZm5Hcm91cCh0aGlzLCAnU2VydmljZXNDZm5Hcm91cCcsIHtcbiAgICAgICAgICAgIG5hbWU6IHN0YWNrTmFtZSxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ29udGFpbnMgYWxsIHRoZSByZXNvdXJjZXMgZGVwbG95ZWQgYnkgQ2xvdWRmb3JtYXRpb24gU3RhY2sgJyArIHN0YWNrTmFtZSxcbiAgICAgICAgICAgIHJlc291cmNlUXVlcnk6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnQ0xPVURGT1JNQVRJT05fU1RBQ0tfMV8wJyxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gRW5hYmxpbmcgQ2xvdWRXYXRjaCBBcHBsaWNhdGlvbiBJbnNpZ2h0cyBmb3IgUmVzb3VyY2UgR3JvdXBcbiAgICAgICAgY29uc3Qgc2VydmljZXNDZm5BcHBsaWNhdGlvbiA9IG5ldyBhcHBsaWNhdGlvbmluc2lnaHRzLkNmbkFwcGxpY2F0aW9uKHRoaXMsICdTZXJ2aWNlc0FwcGxpY2F0aW9uSW5zaWdodHMnLCB7XG4gICAgICAgICAgICByZXNvdXJjZUdyb3VwTmFtZTogc2VydmljZXNDZm5Hcm91cC5uYW1lLFxuICAgICAgICAgICAgYXV0b0NvbmZpZ3VyYXRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgY3dlTW9uaXRvckVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBvcHNDZW50ZXJFbmFibGVkOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgICAgLy8gQWRkaW5nIGRlcGVuZGVuY3kgdG8gY3JlYXRlIHRoZXNlIHJlc291cmNlcyBhdCBsYXN0XG4gICAgICAgIHNlcnZpY2VzQ2ZuR3JvdXAubm9kZS5hZGREZXBlbmRlbmN5KHBldFNpdGVDb3N0Q29udHJvbERhc2hib2FyZCk7XG4gICAgICAgIHNlcnZpY2VzQ2ZuQXBwbGljYXRpb24ubm9kZS5hZGREZXBlbmRlbmN5KHNlcnZpY2VzQ2ZuR3JvdXApO1xuICAgICAgICAvLyBBZGRpbmcgYSBMYW1iZGEgZnVuY3Rpb24gdG8gcHJvZHVjZSB0aGUgZXJyb3JzIC0gbWFudWFsbHkgZXhlY3V0ZWRcbiAgICAgICAgdmFyIGR5bmFtb2RiUXVlcnlMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdkeW5hbW9kYlF1ZXJ5TGFtYmRhUm9sZScsIHtcbiAgICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbU1hbmFnZWRQb2xpY3lBcm4odGhpcywgJ21hbmFnZWRkeW5hbW9kYnJlYWQnLCAnYXJuOmF3czppYW06OmF3czpwb2xpY3kvQW1hem9uRHluYW1vREJSZWFkT25seUFjY2VzcycpLFxuICAgICAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21NYW5hZ2VkUG9saWN5QXJuKHRoaXMsICdsYW1iZGFCYXNpY0V4ZWNSb2xldG9kZGInLCAnYXJuOmF3czppYW06OmF3czpwb2xpY3kvc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpXG4gICAgICAgICAgICBdXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkeW5hbW9kYlF1ZXJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdkeW5hbW9kYi1xdWVyeS1mdW5jdGlvbicsIHtcbiAgICAgICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLy4uL3Jlc291cmNlcy9hcHBsaWNhdGlvbi1pbnNpZ2h0cycpKSxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdkeW5hbW9kYi1xdWVyeS1mdW5jdGlvbi5sYW1iZGFfaGFuZGxlcicsXG4gICAgICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgICAgICAgcm9sZTogZHluYW1vZGJRdWVyeUxhbWJkYVJvbGUsXG4gICAgICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDkwMClcbiAgICAgICAgfSk7XG4gICAgICAgIGR5bmFtb2RiUXVlcnlGdW5jdGlvbi5hZGRFbnZpcm9ubWVudChcIkRZTkFNT0RCX1RBQkxFX05BTUVcIiwgZHluYW1vZGJfcGV0YWRvcHRpb24udGFibGVOYW1lKTtcblxuICAgICAgICB0aGlzLmNyZWF0ZU91cHV0cyhuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHtcbiAgICAgICAgICAgICdDV1NlcnZpY2VBY2NvdW50QXJuJzogY3dzZXJ2aWNlYWNjb3VudC5yb2xlQXJuLFxuICAgICAgICAgICAgJ1hSYXlTZXJ2aWNlQWNjb3VudEFybic6IHhyYXlzZXJ2aWNlYWNjb3VudC5yb2xlQXJuLFxuICAgICAgICAgICAgJ09JRENQcm92aWRlclVybCc6IGNsdXN0ZXIuY2x1c3Rlck9wZW5JZENvbm5lY3RJc3N1ZXJVcmwsXG4gICAgICAgICAgICAnT0lEQ1Byb3ZpZGVyQXJuJzogY2x1c3Rlci5vcGVuSWRDb25uZWN0UHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxuICAgICAgICAgICAgJ1BldFNpdGVVcmwnOiBgaHR0cDovLyR7YWxiLmxvYWRCYWxhbmNlckRuc05hbWV9YCxcbiAgICAgICAgICAgICdEeW5hbW9EQlF1ZXJ5RnVuY3Rpb24nOiBkeW5hbW9kYlF1ZXJ5RnVuY3Rpb24uZnVuY3Rpb25OYW1lXG4gICAgICAgIH0pKSk7XG5cblxuICAgICAgICBjb25zdCBwZXRBZG9wdGlvbnNTdGVwRm4gPSBuZXcgUGV0QWRvcHRpb25zU3RlcEZuKHRoaXMsJ1N0ZXBGbicpO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlU3NtUGFyYW1ldGVycyhuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHtcbiAgICAgICAgICAgICcvcGV0c3RvcmUvdHJhZmZpY2RlbGF5dGltZSc6XCIxXCIsXG4gICAgICAgICAgICAnL3BldHN0b3JlL3J1bXNjcmlwdCc6IFwiIFwiLFxuICAgICAgICAgICAgJy9wZXRzdG9yZS9wZXRhZG9wdGlvbnNzdGVwZm5hcm4nOiBwZXRBZG9wdGlvbnNTdGVwRm4uc3RlcEZuLnN0YXRlTWFjaGluZUFybixcbiAgICAgICAgICAgICcvcGV0c3RvcmUvdXBkYXRlYWRvcHRpb25zdGF0dXN1cmwnOiBzdGF0dXNVcGRhdGVyU2VydmljZS5hcGkudXJsLFxuICAgICAgICAgICAgJy9wZXRzdG9yZS9xdWV1ZXVybCc6IHNxc1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAgICAgJy9wZXRzdG9yZS9zbnNhcm4nOiB0b3BpY19wZXRhZG9wdGlvbi50b3BpY0FybixcbiAgICAgICAgICAgICcvcGV0c3RvcmUvZHluYW1vZGJ0YWJsZW5hbWUnOiBkeW5hbW9kYl9wZXRhZG9wdGlvbi50YWJsZU5hbWUsXG4gICAgICAgICAgICAnL3BldHN0b3JlL3MzYnVja2V0bmFtZSc6IHMzX29ic2VydmFiaWxpdHlwZXRhZG9wdGlvbnMuYnVja2V0TmFtZSxcbiAgICAgICAgICAgICcvcGV0c3RvcmUvc2VhcmNoYXBpdXJsJzogYGh0dHA6Ly8ke3NlYXJjaFNlcnZpY2Uuc2VydmljZS5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX0vYXBpL3NlYXJjaD9gLFxuICAgICAgICAgICAgJy9wZXRzdG9yZS9zZWFyY2hpbWFnZSc6IHNlYXJjaFNlcnZpY2UuY29udGFpbmVyLmltYWdlTmFtZSxcbiAgICAgICAgICAgICcvcGV0c3RvcmUvcGV0bGlzdGFkb3B0aW9uc3VybCc6IGBodHRwOi8vJHtsaXN0QWRvcHRpb25zU2VydmljZS5zZXJ2aWNlLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfS9hcGkvYWRvcHRpb25saXN0L2AsXG4gICAgICAgICAgICAnL3BldHN0b3JlL3BldGxpc3RhZG9wdGlvbnNtZXRyaWNzdXJsJzogYGh0dHA6Ly8ke2xpc3RBZG9wdGlvbnNTZXJ2aWNlLnNlcnZpY2UubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWV9L21ldHJpY3NgLFxuICAgICAgICAgICAgJy9wZXRzdG9yZS9wYXltZW50YXBpdXJsJzogYGh0dHA6Ly8ke3BheUZvckFkb3B0aW9uU2VydmljZS5zZXJ2aWNlLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfS9hcGkvaG9tZS9jb21wbGV0ZWFkb3B0aW9uYCxcbiAgICAgICAgICAgICcvcGV0c3RvcmUvcGF5Zm9yYWRvcHRpb25tZXRyaWNzdXJsJzogYGh0dHA6Ly8ke3BheUZvckFkb3B0aW9uU2VydmljZS5zZXJ2aWNlLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfS9tZXRyaWNzYCxcbiAgICAgICAgICAgICcvcGV0c3RvcmUvY2xlYW51cGFkb3B0aW9uc3VybCc6IGBodHRwOi8vJHtwYXlGb3JBZG9wdGlvblNlcnZpY2Uuc2VydmljZS5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX0vYXBpL2hvbWUvY2xlYW51cGFkb3B0aW9uc2AsXG4gICAgICAgICAgICAnL3BldHN0b3JlL3BldHNlYXJjaC1jb2xsZWN0b3ItbWFudWFsLWNvbmZpZyc6IHJlYWRGaWxlU3luYyhcIi4vcmVzb3VyY2VzL2NvbGxlY3Rvci9lY3MteHJheS1tYW51YWwueWFtbFwiLCBcInV0ZjhcIiksXG4gICAgICAgICAgICAnL3BldHN0b3JlL3Jkc3NlY3JldGFybic6IGAke2F1cm9yYUNsdXN0ZXIuc2VjcmV0Py5zZWNyZXRBcm59YCxcbiAgICAgICAgICAgICcvcGV0c3RvcmUvcmRzZW5kcG9pbnQnOiBhdXJvcmFDbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgICAgICAgICcvcGV0c3RvcmUvc3RhY2tuYW1lJzogc3RhY2tOYW1lLFxuICAgICAgICAgICAgJy9wZXRzdG9yZS9wZXRzaXRldXJsJzogYGh0dHA6Ly8ke2FsYi5sb2FkQmFsYW5jZXJEbnNOYW1lfWAsXG4gICAgICAgICAgICAnL3BldHN0b3JlL3BldGhpc3Rvcnl1cmwnOiBgaHR0cDovLyR7YWxiLmxvYWRCYWxhbmNlckRuc05hbWV9L3BldGFkb3B0aW9uc2hpc3RvcnlgLFxuICAgICAgICAgICAgJy9la3MvcGV0c2l0ZS9PSURDUHJvdmlkZXJVcmwnOiBjbHVzdGVyLmNsdXN0ZXJPcGVuSWRDb25uZWN0SXNzdWVyVXJsLFxuICAgICAgICAgICAgJy9la3MvcGV0c2l0ZS9PSURDUHJvdmlkZXJBcm4nOiBjbHVzdGVyLm9wZW5JZENvbm5lY3RQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICAgICAgICAnL3BldHN0b3JlL2Vycm9ybW9kZTEnOlwiZmFsc2VcIlxuICAgICAgICB9KSkpO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlT3VwdXRzKG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoe1xuICAgICAgICAgICAgJ1F1ZXVlVVJMJzogc3FzUXVldWUucXVldWVVcmwsXG4gICAgICAgICAgICAnVXBkYXRlQWRvcHRpb25TdGF0dXN1cmwnOiBzdGF0dXNVcGRhdGVyU2VydmljZS5hcGkudXJsLFxuICAgICAgICAgICAgJ1NOU1RvcGljQVJOJzogdG9waWNfcGV0YWRvcHRpb24udG9waWNBcm4sXG4gICAgICAgICAgICAnUkRTU2VydmVyTmFtZSc6IGF1cm9yYUNsdXN0ZXIuY2x1c3RlckVuZHBvaW50Lmhvc3RuYW1lXG4gICAgICAgIH0pKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjcmVhdGVTc21QYXJhbWV0ZXJzKHBhcmFtczogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgICAgICBwYXJhbXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgLy9jb25zdCBpZCA9IGtleS5yZXBsYWNlKCcvJywgJ18nKTtcbiAgICAgICAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsIGtleSwgeyBwYXJhbWV0ZXJOYW1lOiBrZXksIHN0cmluZ1ZhbHVlOiB2YWx1ZSB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjcmVhdGVPdXB1dHMocGFyYW1zOiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgICAgIHBhcmFtcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIGtleSwgeyB2YWx1ZTogdmFsdWUgfSlcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19