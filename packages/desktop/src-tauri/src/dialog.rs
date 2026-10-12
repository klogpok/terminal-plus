//! Native error boxes: `showError`, drawn with the texts and button labels the sidecar sent, and the
//! shell's own few boxes (`alert`) for when there is no sidecar to ask.

use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};

use crate::protocol::ErrorBox;

/// Shows the error box and, if the user asks for them, the details in a second box. Blocks until
/// the user has closed both, so call it off the main thread.
pub fn show_error(error: &ErrorBox) {
    let ErrorBox {
        title,
        message,
        details,
        buttons,
        ..
    } = error;
    let Some(details) = details else {
        alert(title, message, MessageButtons::OkCustom(buttons.ok.clone()));
        return;
    };
    let choice = MessageDialog::new()
        .set_level(MessageLevel::Error)
        .set_title(title)
        .set_description(message)
        .set_buttons(MessageButtons::OkCancelCustom(
            buttons.ok.clone(),
            buttons.details.clone(),
        ))
        .show();
    // Esc and the close box answer `Cancel`, not the Details label: they only dismiss.
    if choice == MessageDialogResult::Custom(buttons.details.clone()) {
        MessageDialog::new()
            .set_level(MessageLevel::Info)
            .set_title(&buttons.details_title)
            .set_description(format!("{message}\n\n{details}"))
            .set_buttons(MessageButtons::OkCustom(buttons.ok.clone()))
            .show();
    }
}

/// A plain error box with one button. Blocks until closed.
pub fn alert(title: &str, message: &str, button: MessageButtons) {
    MessageDialog::new()
        .set_level(MessageLevel::Error)
        .set_title(title)
        .set_description(message)
        .set_buttons(button)
        .show();
}
