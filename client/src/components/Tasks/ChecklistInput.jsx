import React, { useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Paper,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
} from '@mui/icons-material';

const ChecklistInput = ({ checklist = [], onChange, disabled = false, canToggleItems = true }) => {
  const [newItemText, setNewItemText] = useState('');

  const handleAddItem = () => {
    if (newItemText.trim()) {
      const newItem = {
        text: newItemText.trim(),
        completed: false,
        completedAt: null,
      };
      onChange([...checklist, newItem]);
      setNewItemText('');
    }
  };

  const handleToggleItem = (index) => {
    const updatedChecklist = checklist.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          completed: !item.completed,
          completedAt: !item.completed ? new Date().toISOString() : null,
        };
      }
      return item;
    });
    onChange(updatedChecklist);
  };

  const handleDeleteItem = (index) => {
    const updatedChecklist = checklist.filter((_, i) => i !== index);
    onChange(updatedChecklist);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddItem();
    }
  };

  const completedCount = checklist.filter((item) => item.completed).length;
  const totalCount = checklist.length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          Checklist
        </Typography>
        {totalCount > 0 && (
          <Typography 
            variant="caption" 
            sx={{ 
              color: completedCount === totalCount ? 'success.main' : 'text.secondary',
              fontWeight: completedCount === totalCount ? 600 : 400
            }}
          >
            {completedCount}/{totalCount} completed
          </Typography>
        )}
      </Box>

      {/* Show message when all items completed */}
      {totalCount > 0 && completedCount === totalCount && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            bgcolor: 'success.light',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'success.main',
          }}
        >
          <Typography variant="body2" sx={{ color: 'success.dark', fontWeight: 500 }}>
            ✅ All checklist items completed! Task will move to review for manager approval.
          </Typography>
        </Box>
      )}

      {/* Add new item input */}
      {!disabled && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Add checklist item..."
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={disabled}
          />
          <IconButton
            color="primary"
            onClick={handleAddItem}
            disabled={!newItemText.trim() || disabled}
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': {
                bgcolor: 'primary.dark',
              },
              '&:disabled': {
                bgcolor: 'action.disabledBackground',
              },
            }}
          >
            <AddIcon />
          </IconButton>
        </Box>
      )}

      {/* Checklist items */}
      {checklist.length > 0 ? (
        <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
          <List dense>
            {checklist.map((item, index) => (
              <React.Fragment key={index}>
                <ListItem
                  sx={{
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={item.completed}
                      onChange={() => handleToggleItem(index)}
                      disabled={!canToggleItems}
                      icon={<UncheckedIcon />}
                      checkedIcon={<CheckCircleIcon />}
                      sx={{
                        color: item.completed ? 'success.main' : 'action.active',
                        '&.Mui-checked': {
                          color: 'success.main',
                        },
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      sx: {
                        textDecoration: item.completed ? 'line-through' : 'none',
                        color: item.completed ? 'text.secondary' : 'text.primary',
                      },
                    }}
                    secondary={
                      item.completed && item.completedAt
                        ? `Completed ${new Date(item.completedAt).toLocaleString()}`
                        : null
                    }
                    secondaryTypographyProps={{
                      variant: 'caption',
                    }}
                  />
                  {!disabled && (
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleDeleteItem(index)}
                        sx={{
                          color: 'error.main',
                          '&:hover': {
                            bgcolor: 'error.light',
                          },
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
                {index < checklist.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </Paper>
      ) : (
        <Box
          sx={{
            textAlign: 'center',
            py: 3,
            px: 2,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.default',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {disabled ? 'No checklist items' : 'Add items to create a checklist'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ChecklistInput;

