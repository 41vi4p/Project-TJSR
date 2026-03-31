"""
Plot training metrics from training_metrics.json
Generates comprehensive visualization of model training progress
"""
import json
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (16, 12)
plt.rcParams['font.size'] = 10

# =========================
# LOAD METRICS
# =========================
metrics_path = "training_metrics.json"

if not Path(metrics_path).exists():
    print(f"❌ Error: {metrics_path} not found")
    print("   Run 'python train_bert.py' first to generate training metrics")
    exit(1)

print(f"📊 Loading training metrics from {metrics_path}...")
with open(metrics_path, 'r') as f:
    metrics = json.load(f)

print(f"✅ Loaded {len(metrics)} epochs of training data\n")

# Extract data
epochs = np.array([m['epoch'] for m in metrics])
train_loss = np.array([m['train_loss'] for m in metrics])
val_loss = np.array([m['val_loss'] for m in metrics])
train_acc = np.array([m['train_acc'] * 100 for m in metrics])
val_acc = np.array([m['val_acc'] * 100 for m in metrics])
train_prec = np.array([m['train_prec'] * 100 for m in metrics])
val_prec = np.array([m['val_prec'] * 100 for m in metrics])
train_recall = np.array([m['train_recall'] * 100 for m in metrics])
val_recall = np.array([m['val_recall'] * 100 for m in metrics])
train_f1 = np.array([m['train_f1'] * 100 for m in metrics])
val_f1 = np.array([m['val_f1'] * 100 for m in metrics])

# Create figure with subplots
fig = plt.figure(figsize=(18, 14))

# ==================
# 1. LOSS PLOT
# ==================
ax1 = plt.subplot(3, 3, 1)
ax1.plot(epochs, train_loss, 'o-', label='Train Loss', linewidth=2, markersize=6, color='#FF6B6B')
ax1.plot(epochs, val_loss, 's-', label='Val Loss', linewidth=2, markersize=6, color='#4ECDC4')
ax1.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax1.set_ylabel('Loss', fontsize=11, fontweight='bold')
ax1.set_title('Loss over Epochs', fontsize=12, fontweight='bold')
ax1.legend(loc='best', fontsize=10)
ax1.grid(True, alpha=0.3)
ax1.set_xlim(0, max(epochs) + 1)

# Find best epoch (min val loss)
best_epoch = epochs[np.argmin(val_loss)]
ax1.axvline(x=best_epoch, color='green', linestyle='--', alpha=0.7, label=f'Best Epoch ({best_epoch})')
ax1.legend(loc='best', fontsize=9)

# ==================
# 2. ACCURACY PLOT
# ==================
ax2 = plt.subplot(3, 3, 2)
ax2.plot(epochs, train_acc, 'o-', label='Train Accuracy', linewidth=2, markersize=6, color='#FF6B6B')
ax2.plot(epochs, val_acc, 's-', label='Val Accuracy', linewidth=2, markersize=6, color='#4ECDC4')
ax2.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax2.set_ylabel('Accuracy (%)', fontsize=11, fontweight='bold')
ax2.set_title('Accuracy over Epochs', fontsize=12, fontweight='bold')
ax2.legend(loc='best', fontsize=10)
ax2.grid(True, alpha=0.3)
ax2.set_ylim(70, 100)
ax2.set_xlim(0, max(epochs) + 1)

# ==================
# 3. PRECISION PLOT
# ==================
ax3 = plt.subplot(3, 3, 3)
ax3.plot(epochs, train_prec, 'o-', label='Train Precision', linewidth=2, markersize=6, color='#FF6B6B')
ax3.plot(epochs, val_prec, 's-', label='Val Precision', linewidth=2, markersize=6, color='#4ECDC4')
ax3.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax3.set_ylabel('Precision (%)', fontsize=11, fontweight='bold')
ax3.set_title('Precision over Epochs', fontsize=12, fontweight='bold')
ax3.legend(loc='best', fontsize=10)
ax3.grid(True, alpha=0.3)
ax3.set_ylim(70, 100)
ax3.set_xlim(0, max(epochs) + 1)

# ==================
# 4. RECALL PLOT
# ==================
ax4 = plt.subplot(3, 3, 4)
ax4.plot(epochs, train_recall, 'o-', label='Train Recall', linewidth=2, markersize=6, color='#FF6B6B')
ax4.plot(epochs, val_recall, 's-', label='Val Recall', linewidth=2, markersize=6, color='#4ECDC4')
ax4.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax4.set_ylabel('Recall (%)', fontsize=11, fontweight='bold')
ax4.set_title('Recall over Epochs', fontsize=12, fontweight='bold')
ax4.legend(loc='best', fontsize=10)
ax4.grid(True, alpha=0.3)
ax4.set_ylim(70, 100)
ax4.set_xlim(0, max(epochs) + 1)

# ==================
# 5. F1 SCORE PLOT
# ==================
ax5 = plt.subplot(3, 3, 5)
ax5.plot(epochs, train_f1, 'o-', label='Train F1', linewidth=2, markersize=6, color='#FF6B6B')
ax5.plot(epochs, val_f1, 's-', label='Val F1', linewidth=2, markersize=6, color='#4ECDC4')
ax5.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax5.set_ylabel('F1 Score (%)', fontsize=11, fontweight='bold')
ax5.set_title('F1 Score over Epochs', fontsize=12, fontweight='bold')
ax5.legend(loc='best', fontsize=10)
ax5.grid(True, alpha=0.3)
ax5.set_ylim(70, 100)
ax5.set_xlim(0, max(epochs) + 1)

# ==================
# 6. ALL METRICS COMBINED (Train)
# ==================
ax6 = plt.subplot(3, 3, 6)
ax6.plot(epochs, train_acc, 'o-', label='Accuracy', linewidth=2, markersize=5, color='#FF6B6B')
ax6.plot(epochs, train_prec, 's-', label='Precision', linewidth=2, markersize=5, color='#4ECDC4')
ax6.plot(epochs, train_recall, '^-', label='Recall', linewidth=2, markersize=5, color='#95E1D3')
ax6.plot(epochs, train_f1, 'D-', label='F1', linewidth=2, markersize=5, color='#F38181')
ax6.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax6.set_ylabel('Score (%)', fontsize=11, fontweight='bold')
ax6.set_title('Training Metrics Combined', fontsize=12, fontweight='bold')
ax6.legend(loc='best', fontsize=9)
ax6.grid(True, alpha=0.3)
ax6.set_ylim(75, 102)
ax6.set_xlim(0, max(epochs) + 1)

# ==================
# 7. ALL METRICS COMBINED (Val)
# ==================
ax7 = plt.subplot(3, 3, 7)
ax7.plot(epochs, val_acc, 'o-', label='Accuracy', linewidth=2, markersize=5, color='#FF6B6B')
ax7.plot(epochs, val_prec, 's-', label='Precision', linewidth=2, markersize=5, color='#4ECDC4')
ax7.plot(epochs, val_recall, '^-', label='Recall', linewidth=2, markersize=5, color='#95E1D3')
ax7.plot(epochs, val_f1, 'D-', label='F1', linewidth=2, markersize=5, color='#F38181')
ax7.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax7.set_ylabel('Score (%)', fontsize=11, fontweight='bold')
ax7.set_title('Validation Metrics Combined', fontsize=12, fontweight='bold')
ax7.legend(loc='best', fontsize=9)
ax7.grid(True, alpha=0.3)
ax7.set_ylim(85, 100)
ax7.set_xlim(0, max(epochs) + 1)

# ==================
# 8. TRAIN vs VAL LOSS (ZOOMED)
# ==================
ax8 = plt.subplot(3, 3, 8)
ax8.fill_between(epochs, train_loss, val_loss, where=(train_loss >= val_loss),
                  color='#FF6B6B', alpha=0.3, label='Overfitting Gap')
ax8.fill_between(epochs, train_loss, val_loss, where=(train_loss < val_loss),
                  color='#4ECDC4', alpha=0.3, label='Underfitting Gap')
ax8.plot(epochs, train_loss, 'o-', label='Train Loss', linewidth=2, markersize=6, color='#FF6B6B')
ax8.plot(epochs, val_loss, 's-', label='Val Loss', linewidth=2, markersize=6, color='#4ECDC4')
ax8.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax8.set_ylabel('Loss', fontsize=11, fontweight='bold')
ax8.set_title('Train vs Val Loss (Overfitting Analysis)', fontsize=12, fontweight='bold')
ax8.legend(loc='best', fontsize=9)
ax8.grid(True, alpha=0.3)
ax8.set_xlim(0, max(epochs) + 1)

# ==================
# 9. STATISTICS TABLE
# ==================
ax9 = plt.subplot(3, 3, 9)
ax9.axis('tight')
ax9.axis('off')

# Create statistics
stats_data = [
    ['Metric', 'Train', 'Val', 'Difference'],
    ['', '', '', ''],
    ['Loss', f'{train_loss[-1]:.4f}', f'{val_loss[-1]:.4f}',
     f'{(train_loss[-1] - val_loss[-1]):+.4f}'],
    ['Accuracy', f'{train_acc[-1]:.2f}%', f'{val_acc[-1]:.2f}%',
     f'{(train_acc[-1] - val_acc[-1]):+.2f}%'],
    ['Precision', f'{train_prec[-1]:.2f}%', f'{val_prec[-1]:.2f}%',
     f'{(train_prec[-1] - val_prec[-1]):+.2f}%'],
    ['Recall', f'{train_recall[-1]:.2f}%', f'{val_recall[-1]:.2f}%',
     f'{(train_recall[-1] - val_recall[-1]):+.2f}%'],
    ['F1 Score', f'{train_f1[-1]:.2f}%', f'{val_f1[-1]:.2f}%',
     f'{(train_f1[-1] - val_f1[-1]):+.2f}%'],
    ['', '', '', ''],
    ['Best Epoch', f'{best_epoch}', '', f'(Val Loss: {val_loss[int(best_epoch)-1]:.4f})'],
    ['Total Epochs', f'{len(epochs)}/{len(epochs)}', '', '(Early Stopping)'],
]

table = ax9.table(cellText=stats_data, cellLoc='center', loc='center',
                  colWidths=[0.25, 0.25, 0.25, 0.25])
table.auto_set_font_size(False)
table.set_fontsize(9)
table.scale(1, 2)

# Style header row
for i in range(4):
    table[(0, i)].set_facecolor('#4ECDC4')
    table[(0, i)].set_text_props(weight='bold', color='white')

# Style best epoch row
for i in range(4):
    table[(8, i)].set_facecolor('#95E1D3')
    table[(8, i)].set_text_props(weight='bold')

ax9.set_title('Final Epoch Statistics', fontsize=12, fontweight='bold', pad=20)

# Overall title
fig.suptitle('🎯 DistilBERT Model Training Metrics Visualization',
             fontsize=16, fontweight='bold', y=0.995)

# Add footer with info
info_text = (f"📊 Total Epochs: {len(epochs)}/23 | "
             f"Best Epoch: {best_epoch} | "
             f"Best Val Loss: {min(val_loss):.4f}")
fig.text(0.5, 0.01, info_text, ha='center', fontsize=11,
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

plt.tight_layout(rect=[0, 0.02, 1, 0.99])

# Save figure
output_path = "training_plots.png"
plt.savefig(output_path, dpi=300, bbox_inches='tight')
print(f"✅ Plot saved as: {output_path}")

# Also save individual plots
print("\n📈 Generating individual plots...\n")

# ==================
# Individual plots with higher quality
# ==================
plots_config = [
    ('Loss', train_loss, val_loss, 'Loss', '#FF6B6B', '#4ECDC4'),
    ('Accuracy', train_acc, val_acc, 'Accuracy (%)', '#FF6B6B', '#4ECDC4'),
    ('Precision', train_prec, val_prec, 'Precision (%)', '#FF6B6B', '#4ECDC4'),
    ('Recall', train_recall, val_recall, 'Recall (%)', '#FF6B6B', '#4ECDC4'),
    ('F1_Score', train_f1, val_f1, 'F1 Score (%)', '#FF6B6B', '#4ECDC4'),
]

for name, train_data, val_data, ylabel, color1, color2 in plots_config:
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(epochs, train_data, 'o-', label='Train', linewidth=2.5, markersize=8, color=color1)
    ax.plot(epochs, val_data, 's-', label='Validation', linewidth=2.5, markersize=8, color=color2)
    ax.set_xlabel('Epoch', fontsize=13, fontweight='bold')
    ax.set_ylabel(ylabel, fontsize=13, fontweight='bold')
    ax.set_title(f'{name} over Training Epochs', fontsize=14, fontweight='bold')
    ax.legend(loc='best', fontsize=12, framealpha=0.95)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, max(epochs) + 1)

    # Add best epoch marker
    best_idx = np.argmin(val_data) if 'Loss' in ylabel else np.argmax(val_data)
    ax.axvline(x=epochs[best_idx], color='green', linestyle='--', alpha=0.7, linewidth=2)
    ax.text(epochs[best_idx], ax.get_ylim()[1]*0.95, f'Best: {epochs[best_idx]:.0f}',
            ha='center', fontsize=10, bbox=dict(boxstyle='round', facecolor='yellow', alpha=0.7))

    plt.tight_layout()
    individual_path = f"training_{name.lower()}.png"
    plt.savefig(individual_path, dpi=300, bbox_inches='tight')
    print(f"  ✅ {individual_path}")
    plt.close()

print("\n" + "="*60)
print("✨ All plots generated successfully!")
print("="*60)
print(f"\n📊 Files created:")
print(f"  ├─ training_plots.png         (Combined visualization)")
print(f"  ├─ training_loss.png")
print(f"  ├─ training_accuracy.png")
print(f"  ├─ training_precision.png")
print(f"  ├─ training_recall.png")
print(f"  └─ training_f1_score.png")

# Print summary statistics
print("\n" + "="*60)
print("📈 Training Summary Statistics")
print("="*60)
print(f"\nFinal Epoch ({len(epochs)}/23):")
print(f"  Train Loss: {train_loss[-1]:.4f} | Val Loss: {val_loss[-1]:.4f}")
print(f"  Train Acc:  {train_acc[-1]:.2f}% | Val Acc:  {val_acc[-1]:.2f}%")
print(f"  Train F1:   {train_f1[-1]:.2f}% | Val F1:   {val_f1[-1]:.2f}%")

print(f"\nBest Validation Performance (Epoch {best_epoch}):")
best_idx = int(best_epoch) - 1
print(f"  Val Loss:   {val_loss[best_idx]:.4f}")
print(f"  Val Acc:    {val_acc[best_idx]:.2f}%")
print(f"  Val Prec:   {val_prec[best_idx]:.2f}%")
print(f"  Val Recall: {val_recall[best_idx]:.2f}%")
print(f"  Val F1:     {val_f1[best_idx]:.2f}%")

print(f"\nImprovement Analysis:")
print(f"  Accuracy improvement:  {val_acc[-1] - val_acc[0]:+.2f}%")
print(f"  Loss improvement:      {train_loss[0] - train_loss[-1]:+.4f}")
print(f"  Overfitting gap (final): {train_acc[-1] - val_acc[-1]:+.2f}%")
