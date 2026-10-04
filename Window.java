import javax.swing.JFrame;

public class Window {
    public static void main(String[] args) {
        // Create a new frame (window)
        JFrame frame = new JFrame("Eventov");
        
        // Set what happens when the close button is clicked
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        
        // Set the size of the window in pixels (width, height)
        frame.setSize(500, 500);
        
        // Make the window visible on the screen
        frame.setVisible(true);
    }
}
