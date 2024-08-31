"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcsService = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const ecs = require("aws-cdk-lib/aws-ecs");
const logs = require("aws-cdk-lib/aws-logs");
const ecs_patterns = require("aws-cdk-lib/aws-ecs-patterns");
const constructs_1 = require("constructs");
class EcsService extends constructs_1.Construct {
    constructor(scope, id, props) {
        var _a, _b;
        super(scope, id);
        const logging = new ecs.AwsLogDriver({
            streamPrefix: "logs",
            logGroup: new logs.LogGroup(this, "ecs-log-group", {
                logGroupName: props.logGroupName,
                removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
            })
        });
        /*
        const firelenslogging = new ecs.FireLensLogDriver({
          options: {
            "Name": "cloudwatch",
            "region": props.region,
            "log_key": "log",
            "log_group_name": props.logGroupName,
            "auto_create_group": "false",
            "log_stream_name": "$(ecs_task_id)"
          }
        });
       //*/
        const taskRole = new iam.Role(this, `taskRole`, {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });
        this.taskDefinition = new ecs.FargateTaskDefinition(this, "taskDefinition", {
            cpu: props.cpu,
            taskRole: taskRole,
            memoryLimitMiB: props.memoryLimitMiB
        });
        this.taskDefinition.addToExecutionRolePolicy(EcsService.ExecutionRolePolicy);
        (_a = this.taskDefinition.taskRole) === null || _a === void 0 ? void 0 : _a.addManagedPolicy(iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonECSTaskExecutionRolePolicy', 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'));
        (_b = this.taskDefinition.taskRole) === null || _b === void 0 ? void 0 : _b.addManagedPolicy(iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSXrayWriteOnlyAccess', 'arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess'));
        // Build locally the image only if the repository URI is not specified
        // Can help speed up builds if we are not rebuilding anything
        const image = props.repositoryURI ? this.containerImageFromRepository(props.repositoryURI) : this.createContainerImage();
        this.container = this.taskDefinition.addContainer('container', {
            image: image,
            memoryLimitMiB: 512,
            cpu: 256,
            logging,
            environment: {
                AWS_REGION: props.region,
            }
        });
        this.container.addPortMappings({
            containerPort: 80,
            protocol: ecs.Protocol.TCP
        });
        /*
        this.taskDefinition.addFirelensLogRouter('firelensrouter', {
          firelensConfig: {
            type: ecs.FirelensLogRouterType.FLUENTBIT
          },
          image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-for-fluent-bit:stable')
        })
       //*/
        // sidecar for instrumentation collecting
        switch (props.instrumentation) {
            // we don't add any sidecar if instrumentation is none
            case "none": {
                break;
            }
            // This collector would be used for both traces collected using
            // open telemetry or X-Ray
            case "otel": {
                this.addOtelCollectorContainer(this.taskDefinition, logging);
                break;
            }
            // Default X-Ray traces collector
            case "xray": {
                this.addXRayContainer(this.taskDefinition, logging);
                break;
            }
            // Default X-Ray traces collector
            // enabled by default
            default: {
                this.addXRayContainer(this.taskDefinition, logging);
                break;
            }
        }
        if (!props.disableService) {
            this.service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "ecs-service", {
                cluster: props.cluster,
                taskDefinition: this.taskDefinition,
                publicLoadBalancer: true,
                desiredCount: props.desiredTaskCount,
                listenerPort: 80,
                securityGroups: [props.securityGroup]
            });
            if (props.healthCheck) {
                this.service.targetGroup.configureHealthCheck({
                    path: props.healthCheck
                });
            }
        }
    }
    addXRayContainer(taskDefinition, logging) {
        taskDefinition.addContainer('xraydaemon', {
            image: ecs.ContainerImage.fromRegistry('public.ecr.aws/xray/aws-xray-daemon:3.3.4'),
            memoryLimitMiB: 256,
            cpu: 256,
            logging
        }).addPortMappings({
            containerPort: 2000,
            protocol: ecs.Protocol.UDP
        });
    }
    addOtelCollectorContainer(taskDefinition, logging) {
        taskDefinition.addContainer('aws-otel-collector', {
            image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:v0.32.0'),
            memoryLimitMiB: 256,
            cpu: 256,
            command: ["--config", "/etc/ecs/ecs-xray.yaml"],
            logging
        });
    }
}
exports.EcsService = EcsService;
EcsService.ExecutionRolePolicy = new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    resources: ['*'],
    actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogGroup",
        "logs:DescribeLogStreams",
        "logs:CreateLogStream",
        "logs:DescribeLogGroups",
        "logs:PutLogEvents",
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets",
        "xray:GetSamplingStatisticSummaries",
        'ssm:GetParameters'
    ]
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNzLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlY3Mtc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw2Q0FBNEM7QUFDNUMsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsNkRBQTZEO0FBRTdELDJDQUFzQztBQXVCdEMsTUFBc0IsVUFBVyxTQUFRLHNCQUFTO0lBNEJoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCOztRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQztZQUNuQyxZQUFZLEVBQUUsTUFBTTtZQUNwQixRQUFRLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7Z0JBQ2pELFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWTtnQkFDaEMsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTzthQUNyQyxDQUFDO1NBQ0gsQ0FBQyxDQUFDO1FBRUg7Ozs7Ozs7Ozs7O1dBV0c7UUFFSCxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUM5QyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMseUJBQXlCLENBQUM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDMUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsUUFBUSxFQUFFLFFBQVE7WUFDbEIsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFD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QUMsWUFBWSxDQUFDLDJDQUEyQyxDQUFDO1lBQ25GLGNBQWMsRUFBRSxHQUFHO1lBQ25CLEdBQUcsRUFBRSxHQUFHO1lBQ1IsT0FBTztTQUNSLENBQUMsQ0FBQyxlQUFlLENBQUM7WUFDakIsYUFBYSxFQUFFLElBQUk7WUFDbkIsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRztTQUMzQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8seUJBQXlCLENBQUMsY0FBeUMsRUFBRSxPQUF5QjtRQUNwRyxjQUFjLENBQUMsWUFBWSxDQUFDLG9CQUFvQixFQUFFO1lBQzlDLEtBQUssRUFBRSxHQUFHLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyw2REFBNkQsQ0FBQztZQUNyRyxjQUFjLEVBQUUsR0FBRztZQUNuQixHQUFHLEVBQUUsR0FBRztZQUNSLE9BQU8sRUFBRSxDQUFDLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQztZQUMvQyxPQUFPO1NBQ1YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUF0S0gsZ0NBdUtDO0FBcktnQiw4QkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7SUFDM0QsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztJQUN4QixTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7SUFDaEIsT0FBTyxFQUFFO1FBQ1AsMkJBQTJCO1FBQzNCLGlDQUFpQztRQUNqQyw0QkFBNEI7UUFDNUIsbUJBQW1CO1FBQ25CLHFCQUFxQjtRQUNyQix5QkFBeUI7UUFDekIsc0JBQXNCO1FBQ3RCLHdCQUF3QjtRQUN4QixtQkFBbUI7UUFDbkIsdUJBQXVCO1FBQ3ZCLDBCQUEwQjtRQUMxQix1QkFBdUI7UUFDdkIseUJBQXlCO1FBQ3pCLG9DQUFvQztRQUNwQyxtQkFBbUI7S0FDcEI7Q0FDRixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSZW1vdmFsUG9saWN5IH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBlY3NfcGF0dGVybnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcy1wYXR0ZXJucyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJ1xuXG5leHBvcnQgaW50ZXJmYWNlIEVjc1NlcnZpY2VQcm9wcyB7XG4gIGNsdXN0ZXI/OiBlY3MuQ2x1c3RlcixcblxuICBjcHU6IG51bWJlcjtcbiAgbWVtb3J5TGltaXRNaUI6IG51bWJlcixcbiAgbG9nR3JvdXBOYW1lOiBzdHJpbmcsXG5cbiAgaGVhbHRoQ2hlY2s/OiBzdHJpbmcsXG5cbiAgZGlzYWJsZVNlcnZpY2U/OiBib29sZWFuLFxuICBpbnN0cnVtZW50YXRpb24/OiBzdHJpbmcsXG5cbiAgcmVwb3NpdG9yeVVSST86IHN0cmluZyxcblxuICBkZXNpcmVkVGFza0NvdW50OiBudW1iZXIsXG5cbiAgcmVnaW9uOiBzdHJpbmcsXG5cbiAgc2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXBcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEVjc1NlcnZpY2UgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuXG4gIHByaXZhdGUgc3RhdGljIEV4ZWN1dGlvblJvbGVQb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgIHJlc291cmNlczogWycqJ10sXG4gICAgYWN0aW9uczogW1xuICAgICAgXCJlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuXCIsXG4gICAgICBcImVjcjpCYXRjaENoZWNrTGF5ZXJBdmFpbGFiaWxpdHlcIixcbiAgICAgIFwiZWNyOkdldERvd25sb2FkVXJsRm9yTGF5ZXJcIixcbiAgICAgIFwiZWNyOkJhdGNoR2V0SW1hZ2VcIixcbiAgICAgIFwibG9nczpDcmVhdGVMb2dHcm91cFwiLFxuICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nU3RyZWFtc1wiLFxuICAgICAgXCJsb2dzOkNyZWF0ZUxvZ1N0cmVhbVwiLFxuICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nR3JvdXBzXCIsXG4gICAgICBcImxvZ3M6UHV0TG9nRXZlbnRzXCIsXG4gICAgICBcInhyYXk6UHV0VHJhY2VTZWdtZW50c1wiLFxuICAgICAgXCJ4cmF5OlB1dFRlbGVtZXRyeVJlY29yZHNcIixcbiAgICAgIFwieHJheTpHZXRTYW1wbGluZ1J1bGVzXCIsXG4gICAgICBcInhyYXk6R2V0U2FtcGxpbmdUYXJnZXRzXCIsXG4gICAgICBcInhyYXk6R2V0U2FtcGxpbmdTdGF0aXN0aWNTdW1tYXJpZXNcIixcbiAgICAgICdzc206R2V0UGFyYW1ldGVycydcbiAgICBdXG4gIH0pO1xuXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgc2VydmljZTogZWNzX3BhdHRlcm5zLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VkU2VydmljZUJhc2U7XG4gIHB1YmxpYyByZWFkb25seSBjb250YWluZXI6IGVjcy5Db250YWluZXJEZWZpbml0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFY3NTZXJ2aWNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgbG9nZ2luZyA9IG5ldyBlY3MuQXdzTG9nRHJpdmVyKHtcbiAgICAgIHN0cmVhbVByZWZpeDogXCJsb2dzXCIsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgXCJlY3MtbG9nLWdyb3VwXCIsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiBwcm9wcy5sb2dHcm91cE5hbWUsXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8qXG4gICAgY29uc3QgZmlyZWxlbnNsb2dnaW5nID0gbmV3IGVjcy5GaXJlTGVuc0xvZ0RyaXZlcih7XG4gICAgICBvcHRpb25zOiB7XG4gICAgICAgIFwiTmFtZVwiOiBcImNsb3Vkd2F0Y2hcIixcbiAgICAgICAgXCJyZWdpb25cIjogcHJvcHMucmVnaW9uLFxuICAgICAgICBcImxvZ19rZXlcIjogXCJsb2dcIixcbiAgICAgICAgXCJsb2dfZ3JvdXBfbmFtZVwiOiBwcm9wcy5sb2dHcm91cE5hbWUsXG4gICAgICAgIFwiYXV0b19jcmVhdGVfZ3JvdXBcIjogXCJmYWxzZVwiLFxuICAgICAgICBcImxvZ19zdHJlYW1fbmFtZVwiOiBcIiQoZWNzX3Rhc2tfaWQpXCJcbiAgICAgIH1cbiAgICB9KTtcbiAgIC8vKi9cblxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIGB0YXNrUm9sZWAsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpXG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgXCJ0YXNrRGVmaW5pdGlvblwiLCB7XG4gICAgICBjcHU6IHByb3BzLmNwdSxcbiAgICAgIHRhc2tSb2xlOiB0YXNrUm9sZSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5tZW1vcnlMaW1pdE1pQlxuICAgIH0pO1xuXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRUb0V4ZWN1dGlvblJvbGVQb2xpY3koRWNzU2VydmljZS5FeGVjdXRpb25Sb2xlUG9saWN5KTtcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLnRhc2tSb2xlPy5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21NYW5hZ2VkUG9saWN5QXJuKHRoaXMsICdBbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScsICdhcm46YXdzOmlhbTo6YXdzOnBvbGljeS9zZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKSk7XG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi50YXNrUm9sZT8uYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tTWFuYWdlZFBvbGljeUFybih0aGlzLCAnQVdTWHJheVdyaXRlT25seUFjY2VzcycsICdhcm46YXdzOmlhbTo6YXdzOnBvbGljeS9BV1NYcmF5V3JpdGVPbmx5QWNjZXNzJykpO1xuXG4gICAgLy8gQnVpbGQgbG9jYWxseSB0aGUgaW1hZ2Ugb25seSBpZiB0aGUgcmVwb3NpdG9yeSBVUkkgaXMgbm90IHNwZWNpZmllZFxuICAgIC8vIENhbiBoZWxwIHNwZWVkIHVwIGJ1aWxkcyBpZiB3ZSBhcmUgbm90IHJlYnVpbGRpbmcgYW55dGhpbmdcbiAgICBjb25zdCBpbWFnZSA9IHByb3BzLnJlcG9zaXRvcnlVUkk/IHRoaXMuY29udGFpbmVySW1hZ2VGcm9tUmVwb3NpdG9yeShwcm9wcy5yZXBvc2l0b3J5VVJJKSA6IHRoaXMuY3JlYXRlQ29udGFpbmVySW1hZ2UoKVxuXG4gICAgdGhpcy5jb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignY29udGFpbmVyJywge1xuICAgICAgaW1hZ2U6IGltYWdlLFxuICAgICAgbWVtb3J5TGltaXRNaUI6IDUxMixcbiAgICAgIGNwdTogMjU2LFxuICAgICAgbG9nZ2luZyxcbiAgICAgIGVudmlyb25tZW50OiB7IC8vIGNsZWFyIHRleHQsIG5vdCBmb3Igc2Vuc2l0aXZlIGRhdGFcbiAgICAgICAgQVdTX1JFR0lPTjogcHJvcHMucmVnaW9uLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5jb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDgwLFxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICB9KTtcblxuICAgIC8qXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRGaXJlbGVuc0xvZ1JvdXRlcignZmlyZWxlbnNyb3V0ZXInLCB7XG4gICAgICBmaXJlbGVuc0NvbmZpZzoge1xuICAgICAgICB0eXBlOiBlY3MuRmlyZWxlbnNMb2dSb3V0ZXJUeXBlLkZMVUVOVEJJVFxuICAgICAgfSxcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KCdwdWJsaWMuZWNyLmF3cy9hd3Mtb2JzZXJ2YWJpbGl0eS9hd3MtZm9yLWZsdWVudC1iaXQ6c3RhYmxlJylcbiAgICB9KVxuICAgLy8qL1xuXG4gICAgLy8gc2lkZWNhciBmb3IgaW5zdHJ1bWVudGF0aW9uIGNvbGxlY3RpbmdcbiAgICBzd2l0Y2gocHJvcHMuaW5zdHJ1bWVudGF0aW9uKSB7XG5cbiAgICAgIC8vIHdlIGRvbid0IGFkZCBhbnkgc2lkZWNhciBpZiBpbnN0cnVtZW50YXRpb24gaXMgbm9uZVxuICAgICAgY2FzZSBcIm5vbmVcIjoge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy8gVGhpcyBjb2xsZWN0b3Igd291bGQgYmUgdXNlZCBmb3IgYm90aCB0cmFjZXMgY29sbGVjdGVkIHVzaW5nXG4gICAgICAvLyBvcGVuIHRlbGVtZXRyeSBvciBYLVJheVxuICAgICAgY2FzZSBcIm90ZWxcIjoge1xuICAgICAgICB0aGlzLmFkZE90ZWxDb2xsZWN0b3JDb250YWluZXIodGhpcy50YXNrRGVmaW5pdGlvbiwgbG9nZ2luZyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWZhdWx0IFgtUmF5IHRyYWNlcyBjb2xsZWN0b3JcbiAgICAgIGNhc2UgXCJ4cmF5XCI6IHtcbiAgICAgICAgdGhpcy5hZGRYUmF5Q29udGFpbmVyKHRoaXMudGFza0RlZmluaXRpb24sIGxvZ2dpbmcpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy8gRGVmYXVsdCBYLVJheSB0cmFjZXMgY29sbGVjdG9yXG4gICAgICAvLyBlbmFibGVkIGJ5IGRlZmF1bHRcbiAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgdGhpcy5hZGRYUmF5Q29udGFpbmVyKHRoaXMudGFza0RlZmluaXRpb24sIGxvZ2dpbmcpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXByb3BzLmRpc2FibGVTZXJ2aWNlKSB7XG4gICAgICB0aGlzLnNlcnZpY2UgPSBuZXcgZWNzX3BhdHRlcm5zLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRmFyZ2F0ZVNlcnZpY2UodGhpcywgXCJlY3Mtc2VydmljZVwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IHByb3BzLmNsdXN0ZXIsXG4gICAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgICBwdWJsaWNMb2FkQmFsYW5jZXI6IHRydWUsXG4gICAgICAgIGRlc2lyZWRDb3VudDogcHJvcHMuZGVzaXJlZFRhc2tDb3VudCxcbiAgICAgICAgbGlzdGVuZXJQb3J0OiA4MCxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5zZWN1cml0eUdyb3VwXVxuXG4gICAgICB9KVxuXG4gICAgICBpZiAocHJvcHMuaGVhbHRoQ2hlY2spIHtcbiAgICAgICAgdGhpcy5zZXJ2aWNlLnRhcmdldEdyb3VwLmNvbmZpZ3VyZUhlYWx0aENoZWNrKHtcbiAgICAgICAgICBwYXRoOiBwcm9wcy5oZWFsdGhDaGVja1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhYnN0cmFjdCBjb250YWluZXJJbWFnZUZyb21SZXBvc2l0b3J5KHJlcG9zaXRvcnlVUkk6IHN0cmluZykgOiBlY3MuQ29udGFpbmVySW1hZ2U7XG5cbiAgYWJzdHJhY3QgY3JlYXRlQ29udGFpbmVySW1hZ2UoKTogZWNzLkNvbnRhaW5lckltYWdlO1xuXG4gIHByaXZhdGUgYWRkWFJheUNvbnRhaW5lcih0YXNrRGVmaW5pdGlvbjogZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbiwgbG9nZ2luZzogZWNzLkF3c0xvZ0RyaXZlcikge1xuICAgIHRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcigneHJheWRhZW1vbicsIHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KCdwdWJsaWMuZWNyLmF3cy94cmF5L2F3cy14cmF5LWRhZW1vbjozLjMuNCcpLFxuICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgIGNwdTogMjU2LFxuICAgICAgbG9nZ2luZ1xuICAgIH0pLmFkZFBvcnRNYXBwaW5ncyh7XG4gICAgICBjb250YWluZXJQb3J0OiAyMDAwLFxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5VRFBcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYWRkT3RlbENvbGxlY3RvckNvbnRhaW5lcih0YXNrRGVmaW5pdGlvbjogZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbiwgbG9nZ2luZzogZWNzLkF3c0xvZ0RyaXZlcikge1xuICAgIHRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignYXdzLW90ZWwtY29sbGVjdG9yJywge1xuICAgICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeSgncHVibGljLmVjci5hd3MvYXdzLW9ic2VydmFiaWxpdHkvYXdzLW90ZWwtY29sbGVjdG9yOnYwLjMyLjAnKSxcbiAgICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgICAgY3B1OiAyNTYsXG4gICAgICAgIGNvbW1hbmQ6IFtcIi0tY29uZmlnXCIsIFwiL2V0Yy9lY3MvZWNzLXhyYXkueWFtbFwiXSxcbiAgICAgICAgbG9nZ2luZ1xuICAgIH0pO1xuICB9XG59XG4iXX0=