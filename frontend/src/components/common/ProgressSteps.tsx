import React from 'react';

interface Step {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  active: boolean;
}

interface ProgressStepsProps {
  steps: Step[];
  onStepClick?: (stepId: string) => void;
  className?: string;
}

const ProgressSteps: React.FC<ProgressStepsProps> = ({ steps, onStepClick, className = '' }) => {
  return (
    <div className={`progress-steps ${className}`}>
      <div className="row">
        {steps.map((step, index) => {
          const isClickable = onStepClick && (step.completed || step.active);
          
          return (
            <div key={step.id} className="col">
              <div className="d-flex align-items-center">
                {/* Step Circle */}
                <div 
                  className={`step-circle ${
                    step.completed ? 'completed' : step.active ? 'active' : 'pending'
                  } ${isClickable ? 'clickable' : ''}`}
                  onClick={() => isClickable && onStepClick(step.id)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: isClickable ? 'pointer' : 'default',
                    backgroundColor: step.completed ? '#28a745' : step.active ? '#007bff' : '#e9ecef',
                    color: step.completed || step.active ? 'white' : '#6c757d',
                    border: step.active ? '2px solid #007bff' : '2px solid transparent',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {step.completed ? (
                    <i className="fas fa-check"></i>
                  ) : (
                    index + 1
                  )}
                </div>
                
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div 
                    className="step-connector"
                    style={{
                      flex: 1,
                      height: '2px',
                      backgroundColor: step.completed ? '#28a745' : '#e9ecef',
                      margin: '0 10px',
                      transition: 'background-color 0.3s ease'
                    }}
                  />
                )}
              </div>
              
              {/* Step Label */}
              <div className="text-center mt-2">
                <div 
                  className={`step-title ${
                    step.completed ? 'text-success' : step.active ? 'text-primary' : 'text-muted'
                  }`}
                  style={{
                    fontSize: '12px',
                    fontWeight: step.active ? 'bold' : 'normal',
                    cursor: isClickable ? 'pointer' : 'default'
                  }}
                  onClick={() => isClickable && onStepClick(step.id)}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div 
                    className="step-description text-muted"
                    style={{
                      fontSize: '10px',
                      marginTop: '2px'
                    }}
                  >
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      <style>{`
        .step-circle.clickable:hover {
          transform: scale(1.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        
        .step-title:hover {
          text-decoration: ${onStepClick ? 'underline' : 'none'};
        }
      `}</style>
    </div>
  );
};

export default ProgressSteps;