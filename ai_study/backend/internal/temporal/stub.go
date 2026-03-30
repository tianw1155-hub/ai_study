// Temporal stub - workflows are disabled for local development without Temporal server
package temporal

import (
	"context"
	"log"
)

type WorkflowOptions struct{}

func InitTemporal(addr string) error {
	log.Printf("[Temporal Stub] Would connect to %s", addr)
	return nil
}

func CloseTemporal() {}

func InitAgentClient(addr string, useMock bool) error {
	log.Printf("[Temporal Stub] Would initialize agent client at %s (mock=%v)", addr, useMock)
	return nil
}

type TaskCreationInput struct {
	RequirementID string
	Description   string
	UserID        string
}

type TaskProcessingInput struct {
	TaskID   string
	TaskType string
	Input    string
}

type RollbackInput struct {
	TaskID         string
	TargetVersion  string
	TargetCommitSHA string
}

func StartRequirementWorkflow(ctx context.Context, reqID, desc, userID string) error {
	log.Printf("[Temporal Stub] Would start requirement workflow: %s", reqID)
	return nil
}

func StartTaskProcessingWorkflow(ctx context.Context, taskID, agentType string) error {
	log.Printf("[Temporal Stub] Would start task processing: %s", taskID)
	return nil
}

func StartRollbackWorkflow(ctx context.Context, taskID, targetVersion string) error {
	log.Printf("[Temporal Stub] Would start rollback: %s -> %s", taskID, targetVersion)
	return nil
}

func RegisterAndRun(ctx context.Context) error {
	log.Println("[Temporal Stub] Worker not running (no Temporal server)")
	return nil
}
