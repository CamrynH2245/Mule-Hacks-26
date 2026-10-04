import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JTextField;
import java.awt.FlowLayout;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class Window {
    public static void main(String[] args) {
        // Create a new frame (window)
        JFrame frame = new JFrame("Eventov");
        
        // Set what happens when the close button is clicked
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        
        // Set the size of the window in pixels (width, height)
        frame.setSize(500, 500);
        
        
        frame.setLayout(new FlowLayout());
        
        //the () sets the width of the textbox
        JTextField textBox = new JTextField(20);
        
        JButton button = new JButton("Submit");
        JLabel label = new JLabel("Your text will appear here.");
        
        button.addActionListener(new ActionListener() {
            @Override 
              public void actionPerformed(ActionEvent e) {
                // Get the text from the text box using .getText()
                String userInput = textBox.getText();
                
                // Update the label with the input text
                label.setText(userInput);
            }          
        });

        //add all components to the window
        frame.add(textBox);
        frame.add(button);
        frame.add(label);
        
        // Make the window visible on the screen
        frame.setVisible(true);

    }
}
